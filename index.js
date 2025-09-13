import cron from 'node-cron';
import {ApiFetcher} from "./class/ApiFetcher.js";
import {DatabaseService} from "./database/index.js";
import {checkCrew} from "./functions/checkCrew.js";
import chalk from "chalk";
import initLogger from "./utils/initLogger.js";
import crypto from "crypto";
import {ProcessLock} from "./class/ProcessLock.js";
import {getEnv} from '@vercel/functions';

import express from 'express';
import router from './router.js';

import {Ratelimit} from "@upstash/ratelimit";
import {Redis} from "@upstash/redis";

const app = express();
const PORT = process.env.PORT || 3000;

function ipLogger(req, res, next) {
	const ip = req.headers['x-forwarded-for'] ||
		req.headers['x-real-ip'] ||
		req.connection.remoteAddress ||
		'anonymous'
	let masked = '';
	if (ip) {
		if (ip.includes('.')) {
			const blocks = ip.split('.');
			masked = `${blocks[0]}.${"▮".repeat(blocks[1].length).slice(0, 3)} .${"▮".repeat(blocks[2].length).slice(0, 3)} .${blocks[blocks.length - 1]}`;
		} else if (ip.includes(':')) {
			const blocks = ip.split(':').filter(Boolean);
			masked =
				`${blocks[0]}:` +
				blocks.slice(1, -1).map(() => '▮').join(':') +
				`:${blocks[blocks.length - 1]}`;
		} else {
			masked = ip;
		}
	}

	const success = res.statusCode < 400;
	req.customReqId = crypto.randomBytes(6).toString('hex');

	console.log(
		`${success ? chalk.green.bold(`[${req.method}] [${req.customReqId}] [${res.statusCode}]`) : chalk.red.bold(`[${req.method}] [${req.customReqId}] [${res.statusCode}]`)} ${chalk.yellow(`${req.originalUrl} - IP: ${masked}`)}`
	);

	if (typeof next === 'function' && success) {
		return next();
	}
	return success;
}

const redis = new Redis({
	url: process.env.UPSTASH_REDIS_REST_URL,
	token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
	redis: redis,
	limiter: Ratelimit.slidingWindow(1, "1 s"),
	analytics: true,
	prefix: "@upstash/ratelimit",
});

const RateLimit = async (req, res, next) => {
	const ip = req.headers['x-forwarded-for'] ||
		req.headers['x-real-ip'] ||
		req.connection.remoteAddress ||
		'127.0.0.1';
	const {success, reset} = await ratelimit.limit(ip);
	if (!success) {
		const retryAfter = Math.floor((reset - Date.now()) / 1000);
		return res
			.status(429)
			.set("Retry-After", String(retryAfter))
			.json({
				error: "COOLDOWN",
				message: `Please wait ${Math.abs(retryAfter)} seconds before making another request.`
			});
	}
	next();
};

app.use(RateLimit);

app.use((req, res, next) => {
	ipLogger(req, res, next);
});

app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.use('/', router);

app.get('/stayalive', (req, res) => {
	res.json({
		message: 'Wakey Wakey',
		timestamp: new Date().toISOString()
	});
});

app.get('/', (req, res) => {
	const {VERCEL_REGION} = getEnv();
	const regions = {
		"arn1": {name: "eu-north-1", loc: "Stockholm, Sweden"},
		"bom1": {name: "ap-south-1", loc: "Mumbai, India"},
		"cdg1": {name: "eu-west-3", loc: "Paris, France"},
		"cle1": {name: "us-east-2", loc: "Cleveland, USA"},
		"cpt1": {name: "af-south-1", loc: "Cape Town, South Africa"},
		"dub1": {name: "eu-west-1", loc: "Dublin, Ireland"},
		"dxb1": {name: "me-central-1", loc: "Dubai, United Arab Emirates"},
		"fra1": {name: "eu-central-1", loc: "Frankfurt, Germany"},
		"gru1": {name: "sa-east-1", loc: "São Paulo, Brazil"},
		"hkg1": {name: "ap-east-1", loc: "Hong Kong"},
		"hnd1": {name: "ap-northeast-1", loc: "Tokyo, Japan"},
		"iad1": {name: "us-east-1", loc: "Washington, D.C., USA"},
		"icn1": {name: "ap-northeast-2", loc: "Seoul, South Korea"},
		"kix1": {name: "ap-northeast-3", loc: "Osaka, Japan"},
		"lhr1": {name: "eu-west-2", loc: "London, United Kingdom"},
		"pdx1": {name: "us-west-2", loc: "Portland, USA"},
		"sfo1": {name: "us-west-1", loc: "San Francisco, USA"},
		"sin1": {name: "ap-southeast-1", loc: "Singapore"},
		"syd1": {name: "ap-southeast-2", loc: "Sydney, Australia"}
	}

	res.json({
		name: "CrewV CnR API",
		description: "Welcome!",
		documentation: "Coming soon",
		version: "1.0.0",
		apiEndpoint: '/',
		region: regions[VERCEL_REGION].name,
		requestId: req.customReqId,
		timestamp: new Date().toISOString()
	});
});

app.use((req, res) => {
	res.status(404).json({
		error: 'Route not found',
		path: req.originalUrl,
		method: req.method,
		timestamp: new Date().toISOString()
	});
});

app.listen(PORT, () => {
	console.log(`Ready on port ${PORT}`);
	console.log(`API available on http://localhost:${PORT}/api`);
});

class PlayerDataProcessor {
	constructor() {
		this.dbService = new DatabaseService();
		this.fetcher = new ApiFetcher();
		this.processLock = new ProcessLock();
		this.urlsConfig = [
			{sId: 'US1', url: 'https://api.gtacnr.net/cnr/players?serverId=US1'},
			{sId: 'US2', url: 'https://api.gtacnr.net/cnr/players?serverId=US2'},
			{sId: 'EU1', url: 'https://api.gtacnr.net/cnr/players?serverId=EU1'},
			{sId: 'EU2', url: 'https://api.gtacnr.net/cnr/players?serverId=EU2'},
			{sId: 'SEA', url: 'https://sea.gtacnr.net/cnr/players?serverId=SEA'}
		];
		this.task = null;
		this.isProcessing = false;
	}

	async processPlayers() {
		if (this.isProcessing) {
			console.log(
				`${chalk.yellow('[SKIP]')} - Skipping execution - previous task still running`
			);
			return {skipped: true};
		}

		const lockId = this.processLock.acquire('player-data-fetch');
		console.log(`${chalk.blue('[LOCK]')} - Acquired lock: ${lockId}`);

		this.isProcessing = true;

		const invalidPlayers = [];
		const startTime = Date.now();

		try {
			await this.dbService.connect();

			const fetchStart = Date.now();
			this.fetcher.setUrls(this.urlsConfig);
			this.fetcher.setName('CnRAPI');
			const results = await this.fetcher.fetchAllWithDelay();
			const fetchTime = Date.now() - fetchStart;
			console.log(`${chalk.blue('[TIMING]')} - API fetch: ${fetchTime}ms`);

			const transformStart = Date.now();
			const transformedPlayers = await Promise.all(
				results.data.map(async (player, index) => {
					try {
						if (!player?.Uid) {
							invalidPlayers.push({
								index,
								reason: !player ? 'Null player' : 'Missing Uid',
								serverId: player?.sId || 'Unknown',
								username: player?.Username?.Username || 'Unknown'
							});
							return null;
						}

						const username = player.Username?.Username || '';
						const crewResult = await checkCrew(username);

						return {
							Uid: player.Uid,
							Username: username,
							Crew: crewResult?.crewName || null,
							sId: player.sId,
							Timestamp: player.Username?.Timestamp ? new Date(player.Username.Timestamp) : null
						};
					} catch (error) {
						invalidPlayers.push({
							index,
							reason: `Transform error: ${error.message}`,
							serverId: player?.sId || 'Unknown',
							username: player?.Username?.Username || 'Unknown'
						});
						return null;
					}
				})
			);

			const validPlayers = transformedPlayers.filter(Boolean);
			const transformTime = Date.now() - transformStart;
			console.log(`${chalk.blue('[TIMING]')} - Data transform: ${transformTime}ms`);

			if (validPlayers.length === 0) {
				console.warn(`No valid players to process`);
				return this.logResults(0, invalidPlayers.length, 0);
			}

			const dbStart = Date.now();
			try {
				let method;
				if (validPlayers.length > 500) {
					method = 'upsertPlayersOptimizedNative';
				} else if (validPlayers.length > 100) {
					method = 'bulkUpsertPlayers';
				} else if (validPlayers.length > 50) {
					method = 'upsertPlayersOptimized';
				} else {
					method = 'upsertPlayersTransaction';
				}

				console.log(`${chalk.blue('[METHOD]')} - Using ${method} for ${validPlayers.length} players`);
				await this.dbService[method](validPlayers);
				await this.dbService.upsertLastFetch();
			} catch (error) {
				console.error(`Upsert error:`, error.message);

				console.log(`${chalk.yellow('[FALLBACK]')} - Trying fallback method`);
				try {
					await this.dbService.upsertPlayersTransaction(validPlayers);
					await this.dbService.upsertLastFetch();
				} catch (fallbackError) {
					console.error(`Fallback error:`, fallbackError.message);
				}
			}

			const dbTime = Date.now() - dbStart;
			console.log(`${chalk.blue('[TIMING]')} - Database upsert: ${dbTime}ms`);

			const processingTime = Date.now() - startTime;
			console.log(`${chalk.green('[TOTAL]')} - Total processing time: ${processingTime}ms (Fetch: ${fetchTime}ms, Transform: ${transformTime}ms, DB: ${dbTime}ms)`);

			return this.logResults(validPlayers.length, invalidPlayers.length, processingTime);

		} catch (error) {
			console.error(`Processing error:`, error.message);
			return {error: error.message, invalidPlayers};
		} finally {
			try {
				await this.dbService.disconnect();
			} catch (error) {
				console.error(`Disconnect error:`, error.message);
			}

			this.isProcessing = false;

			this.processLock.release(lockId);
			console.log(`${chalk.blue('[UNLOCK]')} - Released lock: ${lockId}`);
		}
	}

	logResults(validCount, invalidCount, processingTime) {
		if (invalidCount > 0) {
			console.log(`${invalidCount} players had issues`);
		}

		return {validCount, invalidCount, processingTime};
	}

	start() {
		console.log(`Starting player data processor (every minute)`);

		this.processPlayers();

		this.task = cron.schedule('* * * * *', async () => {
			await this.processPlayers();
		}, {
			scheduled: false,
			timezone: 'Europe/Paris'
		});

		this.task.start();
	}

	stop() {
		if (this.task) {
			this.task.stop();
			this.task.destroy();
			this.task = null;
			console.log(`Player data processor stopped`);
		}

		this.isProcessing = false;
	}

	getStatus() {
		return {
			isRunning: this.task && this.task.getStatus() === 'scheduled',
			isProcessing: this.isProcessing,
			activeLocks: this.processLock.getActiveLocks()
		};
	}
}

(async () => {
	initLogger({
		"enabled": true,
		"showDate": true,
		"showFile": true,
		"showRelativePath": false,
		"fileUpperCase": false,
		"fileCapitalized": false,
		"enableLog": true,
		"enableError": true
	});
})();

process.on('uncaughtException', async (error) => {
	console.error(`Uncaught Exception:`, error.message);
});

process.on('unhandledRejection', async (reason) => {
	console.error(`Unhandled Rejection:`, reason);
});

const processor = new PlayerDataProcessor();
processor.start();