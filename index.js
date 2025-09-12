import cron from 'node-cron';
import {ApiFetcher} from "./class/ApiFetcher.js";
import {DatabaseService} from "./database/index.js";
import {checkCrew} from "./functions/checkCrew.js";
import chalk from "chalk";
import initLogger from "./utils/initLogger.js";
import crypto from "crypto";
import ProcessLock from "./class/ProcessLock.js"; // Importation de ProcessLock

import express from 'express';
// import rateLimit from 'express-rate-limit';
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
	// 	req.socket.remoteAddress;
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
	limiter: Ratelimit.slidingWindow(1, "1 s"), // 1 request per 30 seconds
	analytics: true, // Enable analytics
	prefix: "@upstash/ratelimit", // Custom prefix
});

const RateLimit = async (req, res, next) => {
	const ip = req.get("x-forward-for") ?? "192.168.1.1"; // Get IP address
	const { success, reset } = await ratelimit.limit(ip); // Check request limit
	if (!success) { // Too many requests
		const retryAfter = Math.floor((reset - Date.now()) / 1000);
		return res
			.status(429)
			.set("Retry-After", String(retryAfter))
			.send("Too Many Requests");
	}
	next(); // Allow the request
};

app.use(RateLimit);

app.use((req, res, next) => {
	ipLogger(req, res, next);
});

app.use(express.json());
app.use(express.urlencoded({extended: true}));

// Utiliser le router
app.use('/api', router);

app.get('/', (req, res) => {
	res.json({
		name: "Unofficial CnR API",
		description: "Welcome!",
		documentation: "Coming soon",
		version: "1.0.0",
		apiEndpoint: '/api',
		requestId: req.customReqId,
		timestamp: new Date().toISOString()
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

// Démarrage du serveur
app.listen(PORT, () => {
	console.log(`Ready on port ${PORT}`);
	console.log(`API available on http://localhost:${PORT}/api`);
});

class PlayerDataProcessor {
	constructor() {
		this.dbService = new DatabaseService();
		this.fetcher = new ApiFetcher();
		this.processLock = new ProcessLock(); // Initialisation du ProcessLock
		this.urlsConfig = [
			{sId: 'US1', url: 'https://api.gtacnr.net/cnr/players?serverId=US1'},
			{sId: 'US2', url: 'https://api.gtacnr.net/cnr/players?serverId=US2'},
			{sId: 'EU1', url: 'https://api.gtacnr.net/cnr/players?serverId=EU1'},
			{sId: 'EU2', url: 'https://api.gtacnr.net/cnr/players?serverId=EU2'},
			{sId: 'SEA', url: 'https://sea.gtacnr.net/cnr/players?serverId=SEA'}
		];
		this.task = null;
		this.isProcessing = false; // Flag pour empêcher les exécutions simultanées
	}

	async processPlayers() {
		// Vérifier si un traitement est déjà en cours
		if (this.isProcessing) {
			console.log(
				`${chalk.yellow('[SKIP]')} - Skipping execution - previous task still running`
			);
			return {skipped: true};
		}

		// Acquérir le lock avant de commencer le traitement
		const lockId = this.processLock.acquire('player-data-fetch');
		console.log(`${chalk.blue('[LOCK]')} - Acquired lock: ${lockId}`);

		// Marquer comme en cours de traitement
		this.isProcessing = true;

		const invalidPlayers = [];
		const startTime = Date.now();

		try {
			await this.dbService.connect();

			// Mesurer le temps de fetch
			const fetchStart = Date.now();
			this.fetcher.setUrls(this.urlsConfig);
			this.fetcher.setName('CnRAPI');
			const results = await this.fetcher.fetchAllWithDelay();
			const fetchTime = Date.now() - fetchStart;
			console.log(`${chalk.blue('[TIMING]')} - API fetch: ${fetchTime}ms`);

			// Mesurer le temps de transformation
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

			// Mesurer le temps de base de données avec méthode optimisée
			const dbStart = Date.now();
			let upsertResults = [];
			try {
				// Nouvelle logique de sélection de méthode
				let method;
				if (validPlayers.length > 500) {
					method = 'upsertPlayersOptimizedNative'; // SQL natif pour très gros volumes
				} else if (validPlayers.length > 100) {
					method = 'bulkUpsertPlayers'; // Bulk upsert pour volumes moyens
				} else if (validPlayers.length > 50) {
					method = 'upsertPlayersOptimized'; // Chunks optimisés
				} else {
					method = 'upsertPlayersTransaction'; // Transaction simple pour petits volumes
				}

				console.log(`${chalk.blue('[METHOD]')} - Using ${method} for ${validPlayers.length} players`);
				upsertResults = await this.dbService[method](validPlayers);
			} catch (error) {
				console.error(`Upsert error:`, error.message);

				// Fallback vers une méthode plus simple en cas d'erreur
				console.log(`${chalk.yellow('[FALLBACK]')} - Trying fallback method`);
				try {
					upsertResults = await this.dbService.upsertPlayersTransaction(validPlayers);
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

			// Libérer le lock à la fin du traitement
			this.processLock.release(lockId);
			console.log(`${chalk.blue('[UNLOCK]')} - Released lock: ${lockId}`);
		}
	}

	logResults(validCount, invalidCount, processingTime) {
		// console.log(`Processed: ${validCount} valid, ${invalidCount} invalid players in ${processingTime}ms`);

		if (invalidCount > 0) {
			console.log(`${invalidCount} players had issues`);
		}

		return {validCount, invalidCount, processingTime};
	}

	start() {
		console.log(`Starting player data processor (every minute)`);

		// Exécution immédiate
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
			activeLocks: this.processLock.getActiveLocks() // Ajout des locks actifs au status
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