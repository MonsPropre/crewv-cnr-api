import {DatabaseService} from "./database/index.js";
import chalk from "chalk";
import initLogger from "./utils/initLogger.js";
import crypto from "crypto";

import express from 'express';
import cors from 'cors';
import redis from "./utils/redis.js";
import path from "path";
// import redis from "./utils/redis.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/favicon.ico', (req, res) => {
	res.status(404).end();
});

function ipLogger(req, res, next) {
	const ip = req.headers['x-forwarded-for'] ||
		req.headers['x-real-ip'] ||
		req.connection.remoteAddress ||
		'anonymous';

	let masked = '';
	if (ip) {
		if (ip.includes('.')) {
			const blocks = ip.split('.');
			masked = `${blocks[0]}.▮.▮.${blocks[blocks.length - 1]}`;
		} else if (ip.includes(':')) {
			const blocks = ip.split(':').filter(Boolean);
			masked = `${blocks[0]}:${blocks.slice(1, -1).map(() => '▮').join(':')}:${blocks[blocks.length - 1]}`;
		} else {
			masked = "[Not Handled]";
		}
	}

	req.customReqId = crypto.randomBytes(6).toString('hex');

	// Hook dans l'événement de fin de réponse pour logger après l'envoi
	res.on('finish', () => {
		const success = res.statusCode < 400;
		console.log(
			`${success ? chalk.green.bold(`[${req.method}] [${req.customReqId}] [${res.statusCode}]`) : chalk.red.bold(`[${req.method}] [${req.customReqId}] [${res.statusCode}]`)} ${chalk.yellow(`${req.originalUrl} - IP: ${masked}`)}`
		);
	});

	next();
}

const RateLimit = async (req, res, next) => {
	const ip = req.headers['x-forwarded-for'] ||
		req.headers['x-real-ip'] ||
		req.connection.remoteAddress ||
		'127.0.0.1';

	const requests = await redis.incr(ip);
	if (requests === 1) {
		await redis.expire(ip, 1);
	}

	if (requests > 1) {
		return res
			.status(429)
			.set("Retry-After", 1)
			.end();
	}

	next();
};

app.set('trust proxy', ["10.0.3.0/24"]);

app.use(ipLogger);
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.get("/players/info", RateLimit, async (req, res) => {
	const {uid, username} = req.query;
	const startTime = performance.now();
	const dbService = new DatabaseService();

	if (!uid && !username) {
		return res.status(400).json({
			error: "Please specify either 'uid', or 'username' for the search."
		});
	}

	try {
		let cacheKey = null;
		let searchField = null;
		let searchValue = null;

		if (uid) {
			cacheKey = `players:uid:${uid}`;
			searchField = 'uid';
			searchValue = uid;
		} else if (username) {
			cacheKey = `players:username:${username}`;
			searchField = 'username';
			searchValue = username;
		}

		const [cachedData, ttl] = await Promise.all([
			redis.get(cacheKey),
			redis.ttl(cacheKey)
		]);

		if (cachedData) {
			const endTime = performance.now();
			const duration = (endTime - startTime).toFixed(2);

			// Vérifier si c'est un cache négatif (404)
			const parsedData = JSON.parse(cachedData);
			if (parsedData.error) {
				return res.status(404).json({
					...parsedData,
					ping: duration,
					cached: true,
					ttl
				});
			}

			const response = {
				...parsedData,
				ping: duration,
				cached: true,
				ttl
			};

			return res.status(200).json(response);
		}

		const where = {};
		if (uid) where.Uid = uid;
		if (username) where.Username = username;

		const [players, lastFetchData] = await Promise.all([
			dbService.searchPlayers(where),
			dbService.getLastFetch()
		]);

		const endTime = performance.now();
		const duration = (endTime - startTime).toFixed(2);

		if (!players || players.length === 0) {
			const notFoundResponse = {
				error: "Player not found.",
				ping: duration,
				cached: false
			};

			// Cache seulement les données nécessaires (sans ping et cached)
			await redis.set(cacheKey, JSON.stringify({
				error: "Player not found."
			}), "EX", 60);

			return res.status(404).json(notFoundResponse);
		}

		const playerData = {
			...players[0],
			lastFetch: lastFetchData?.lastFetch || null
		};

		const response = {
			...playerData,
			ping: duration,
			cached: false
		};

		const cacheData = JSON.stringify(playerData);
		const cachePromises = [];

		if (players[0].id) {
			cachePromises.push(redis.set(`players:id:${players[0].id}`, cacheData, "EX", 60));
		}
		if (players[0].Uid) {
			cachePromises.push(redis.set(`players:uid:${players[0].Uid}`, cacheData, "EX", 60));
		}
		if (players[0].Username) {
			cachePromises.push(redis.set(`players:username:${players[0].Username}`, cacheData, "EX", 60));
		}

		await Promise.all(cachePromises);

		res.status(200).json(response);

	} catch (error) {
		console.error('Error in /players/info endpoint:', error);
		res.status(500).json({
			error: "Internal server error.",
			...(process.env.NODE_ENV === 'development' && {details: error.message})
		});
	}
});

app.get('/servers/info', RateLimit, async (req, res) => {
	const startTime = performance.now();
	const dbService = new DatabaseService();

	try {
		// Try to get data from cache first
		const cacheKey = 'servers:all';
		const [cachedData, ttl] = await Promise.all([
			redis.get(cacheKey),
			redis.ttl(cacheKey)
		]);

		if (cachedData) {
			const endTime = performance.now();
			const duration = (endTime - startTime).toFixed(2);

			return res.status(200).json({
				...JSON.parse(cachedData),
				ping: duration,
				cached: true,
				ttl
			});
		}

		const servers = await dbService.getAllServers();

		const endTime = performance.now();
		const duration = (endTime - startTime).toFixed(2);

		if (!servers || servers.length === 0) {
			return res.status(404).json({
				error: "No servers found",
				ping: duration,
				cached: false
			});
		}

		const response = {
			servers: servers.map(server => ({
				id: server.id,
				sId: server.sId,
				time: server.time,
				restartAt: server.restartAt
			})),
			count: servers.length
		};

		// Cache the response for 60 seconds
		await redis.set(cacheKey, JSON.stringify(response), "EX", 60);

		res.status(200).json({
			...response,
			ping: duration,
			cached: false
		});

	} catch (error) {
		console.error('Error in /servers/info endpoint:', error);
		res.status(500).json({
			error: "Internal server error.",
			...(process.env.NODE_ENV === 'development' && {details: error.message})
		});
	}
});

app.get('/stayalive', RateLimit, (req, res) => {
	res.json({
		message: 'Wakey Wakey',
		timestamp: new Date().toISOString()
	});
});

app.get('/', RateLimit, (req, res) => {
	res.json({
		name: "CrewV CnR API",
		description: "Welcome!",
		documentation: "Coming soon",
		version: "1.0.0",
		apiEndpoint: '/',
		requestId: req.customReqId,
		timestamp: new Date().toISOString()
	});
});

app.use((req, res) => {
	res.status(404).json({
		error: 'Route not found',
		path: req.originalUrl,
		method: req.method,
		timestamp: new Date().toISOString(),
	});
});

app.listen(PORT, () => {
	console.log(`Ready on port ${PORT}`);
	console.log(`API available on http://localhost:${PORT}/api`);
});

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