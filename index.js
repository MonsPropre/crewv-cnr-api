import cron from 'node-cron';
import {ApiFetcher} from "./class/ApiFetcher.js";
import {DatabaseService} from "./database/index.js";
import {checkCrew} from "./functions/checkCrew.js";
import chalk from "chalk";
import initLogger from "./utils/initLogger.js";

import express from 'express';
import rateLimit from 'express-rate-limit';
import router from './router.js';
import ProcessLock from "./class/ProcessLock.js";

const processLock = new ProcessLock();

// ---- Express App ----

const app = express();
const PORT = process.env.PORT || 3000;

function ipLogger(req, res, next) {
	const ip = req.headers['x-forwarded-for']?.split(',') || req.connection.remoteAddress || '127.0.0.1';
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

	console.log(
		`${success ? chalk.green.bold(`[${req.method}] [${res.statusCode}]`) : chalk.red.bold(`[${req.method}] [${res.statusCode}]`)} ${chalk.yellow(`${req.originalUrl} - IP: ${masked}`)}`
	);

	if (typeof next === 'function' && success) {
		return next();
	}
	return success;
}

const ipLimiter = rateLimit({
	windowMs: 1000,
	limit: 1,
	standardHeaders: true,
	legacyHeaders: false,
	handler: (req, res, next, options) => {
		const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
		res.setHeader('Retry-After', retryAfter);
		res.status(options.statusCode).json({
			error: "COOLDOWN",
			message: `Please wait ${retryAfter} seconds before making another request.`
		});
		ipLogger(req, res, next);
	},
});

app.use(ipLimiter);

app.use((req, res, next) => {
	ipLogger(req, res, next);
});

app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.use('/api', router);

app.get('/', (req, res) => {
	res.json({
		name: "Unofficial CnR API",
		description: "Welcome!",
		documentation: "Coming soon",
		version: "1.0.0",
		apiEndpoint: '/api'
	});
});

app.use((req, res, next) => {
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

// ---- PlayerDataProcessor with ProcessLock ----

class PlayerDataProcessor {
	constructor() {
		this.dbService = new DatabaseService();
		this.fetcher = new ApiFetcher();
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

		const lockId = processLock.acquire('processPlayers');
		this.isProcessing = true;
		const invalidPlayers = [];
		const startTime = Date.now();

		try {
			await this.dbService.connect();

			this.fetcher.setUrls(this.urlsConfig);
			this.fetcher.setName('CnRAPI');
			const results = await this.fetcher.fetchAllWithDelay();

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

			if (validPlayers.length === 0) {
				console.warn(`No valid players to process`);
				return this.logResults(0, invalidPlayers.length, 0);
			}

			let upsertResults = [];
			try {
				const method = validPlayers.length > 200 ? 'upsertPlayersOptimized' : 'upsertPlayersTransaction';
				upsertResults = await this.dbService[method](validPlayers);
			} catch (error) {
				console.error(`Upsert error:`, error.message);
			}

			const processingTime = Date.now() - startTime;
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
			processLock.release(lockId);
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
			isProcessing: this.isProcessing
		};
	}
}

(async () => {
	initLogger({
		"enabled": true,
		"showDate": true,
		"showFile": false,
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
