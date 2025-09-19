import {DatabaseService} from "./database/index.js";
import chalk from "chalk";
import initLogger from "./utils/initLogger.js";
import crypto from "crypto";

import express from 'express';
import cors from 'cors';
import redis from "./utils/redis.js";

const app = express();
const PORT = process.env.PORT || 3000;

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

	// Toujours appeler next() pour continuer la chaîne de middlewares
	next();
}

// const RateLimit = async (req, res, next) => {
// 	const ip = req.headers['x-forwarded-for'] ||
// 		req.headers['x-real-ip'] ||
// 		req.connection.remoteAddress ||
// 		'127.0.0.1';
//
// 	const requests = await redis.incr(ip);
// 	if (requests === 1) {
// 		await redis.expire(ip, 1);
// 	}
//
// 	if (requests > 1) {
// 		return res
// 			.status(429)
// 			.set("Retry-After", 1)
// 			.end();
// 	}
//
// 	next();
// };

app.use(ipLogger);
// app.use(RateLimit);
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.get("/players/info", async (req, res) => {
	const {id, uid, username} = req.query;
	const dbService = new DatabaseService();

	if (!id && !uid && !username) {
		return res.status(400).json({
			error: "Please specify either 'id', 'uid', or 'username' for the search."
		});
	}

	try {
		const where = {};

		if (id) {
			const numericId = Number(id);
			if (isNaN(numericId)) {
				return res.status(400).json({
					error: "Invalid 'id' parameter. Must be a number."
				});
			}
			where.id = numericId;
		}

		if (uid) where.Uid = uid;

		if (username) where.Username = username;

		const [players, lastFetchData] = await Promise.all([
			dbService.searchPlayers(where),
			dbService.getLastFetch()
		]);

		const response = {
			...players[0],
			lastFetch: lastFetchData?.lastFetch || null
		};

		res.status(200).json(response);
	} catch (error) {
		console.error('Error in /players/info endpoint:', error);
		res.status(500).json({
			error: "Internal server error.",
			...(process.env.NODE_ENV === 'development' && {details: error.message})
		});
	}
});

app.get('/stayalive', (req, res) => {
	res.json({
		message: 'Wakey Wakey',
		timestamp: new Date().toISOString()
	});
});

app.get('/', (req, res) => {
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
		timestamp: new Date().toISOString()
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