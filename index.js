import {DatabaseService} from "./database/index.js";
import chalk from "chalk";
import initLogger from "./utils/initLogger.js";
import crypto from "crypto";
import {getEnv} from '@vercel/functions';

import express from 'express';
import cors from 'cors';

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
			masked = `${blocks[0]}.▮.▮.${blocks[blocks.length - 1]}`;
		} else if (ip.includes(':')) {
			const blocks = ip.split(':').filter(Boolean);
			masked = `${blocks[0]}:${blocks.slice(1, -1).map(() => '▮').join(':')}:${blocks[blocks.length - 1]}`;
		} else {
			masked = "[Not Handled]";
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
		console.log(retryAfter);
		return res
			.status(429)
			.set("Retry-After", String(retryAfter))
			.end();
	}
	next();
};

app.use(RateLimit);
app.use(cors());

app.use((req, res, next) => {
	ipLogger(req, res, next);
});

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
		region: regions[VERCEL_REGION]?.name || null,
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

// export default app;

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