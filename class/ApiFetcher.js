import fetch from 'node-fetch'; // npm install node-fetch@2
import chalk from 'chalk';

export class ApiFetcher {
	constructor() {
		this.fetchURLs = [];
		this.delayMs = 1000;
		this.fetcherName = 'DefaultFetcher';
	}

	delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	extractUrl(urlItem) {
		if (typeof urlItem === 'string') {
			return urlItem;
		}
		if (typeof urlItem === 'object' && urlItem.url) {
			return urlItem.url;
		}
		throw new Error('Invalid URL format: expected string or object with url property');
	}

	isValidUrl(url) {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}

	async fetchSingleUrl(urlItem, options = {}) {
		let url;
		let identifier;
		let sId = null;

		try {
			if (typeof urlItem === 'string') {
				url = urlItem;
				identifier = urlItem;
			} else if (typeof urlItem === 'object' && urlItem.url) {
				url = urlItem.url;
				identifier = urlItem.sId || urlItem.url;
				sId = urlItem.sId;
			} else {
				throw new Error('Invalid URL format: expected string or object with url property');
			}

			if (!this.isValidUrl(url)) {
				throw new Error(`Invalid URL format: ${url}`);
			}

			console.log(
				`${chalk.blue('[FETCH]')} - ${chalk.magenta(this.fetcherName)} - Fetching: ${chalk.cyan(identifier)} (${url})`
			);

			const response = await fetch(url, {
				timeout: 1100,
				...options
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();

			let enhancedData = data;
			if (sId && Array.isArray(data)) {
				enhancedData = data.map(item => ({
					...item,
					sId: sId
				}));
			} else if (sId && typeof data === 'object' && data !== null) {
				enhancedData = {
					...data,
					sId: sId
				};
			}

			console.log(
				`${chalk.green('[SUCCESS]')} - ${chalk.magenta(this.fetcherName)} - ${identifier} - ${chalk.gray(`${enhancedData.length || Object.keys(enhancedData).length} items`)}`
			);

			return {
				url,
				identifier,
				sId,
				success: true,
				data: enhancedData,
				originalData: data,
				status: response.status,
				timestamp: new Date().toISOString()
			};

		} catch (error) {
			console.error(
				`${chalk.red('[ERROR]')} - ${chalk.magenta(this.fetcherName)} - ${identifier || 'Unknown'} - ${error.message}`
			);

			return {
				url: url || 'Invalid URL',
				identifier: identifier || 'Unknown',
				sId: sId,
				success: false,
				error: error.message,
				timestamp: new Date().toISOString(),
				data: null
			};
		}
	}

	async fetchAllWithDelay(urls = this.fetchURLs, delayMs = this.delayMs, options = {}) {
		console.log(
			`${chalk.magenta('[API FETCHER]')} - ${chalk.magenta(this.fetcherName)} - Starting fetch for ${urls.length} URLs with ${delayMs}ms delay`
		);

		const results = [];
		const startTime = Date.now();

		for (let i = 0; i < urls.length; i++) {
			const urlItem = urls[i];

			const result = await this.fetchSingleUrl(urlItem, options);
			results.push(result);

			if (i < urls.length - 1) {
				console.log(
					`${chalk.yellow('[DELAY]')} - ${chalk.magenta(this.fetcherName)} - Waiting ${delayMs}ms before next request...`
				);
				await this.delay(delayMs);
			}
		}

		const endTime = Date.now();
		const totalTime = endTime - startTime;

		const successful = results.filter(r => r.success).length;
		const failed = results.filter(r => !r.success).length;

		const aggregatedData = results.reduce((accumulator, result) => {
			if (result.success && result.data) {
				if (Array.isArray(result.data)) {
					accumulator.push(...result.data);
				} else {
					accumulator.push(result.data);
				}
			}
			return accumulator;
		}, []);

		console.log(
			`${chalk.magenta('[COMPLETED]')} - ${chalk.magenta(this.fetcherName)} - Fetch completed in ${chalk.cyan(totalTime + 'ms')}`
		);
		console.log(
			`${chalk.green('✓ Success:')} ${successful} | ${chalk.red('✗ Failed:')} ${failed}`
		);

		return {
			fetcherName: this.fetcherName,
			data: aggregatedData,
			results,
			summary: {
				total: urls.length,
				successful,
				failed,
				totalTimeMs: totalTime,
				averageTimePerRequest: Math.round(totalTime / urls.length),
				totalDataItems: aggregatedData.length
			}
		};
	}

	async fetchAllWithRetry(urls = this.fetchURLs, delayMs = this.delayMs, maxRetries = 2) {
		console.log(
			`${chalk.magenta('[API FETCHER]')} - ${chalk.magenta(this.fetcherName)} - Starting fetch with retry (max ${maxRetries} retries)`
		);

		const results = [];
		const startTime = Date.now();

		for (let i = 0; i < urls.length; i++) {
			const urlItem = urls[i];
			let result;
			let attempt = 0;

			do {
				if (attempt > 0) {
					const identifier = typeof urlItem === 'object' ? urlItem.sId || urlItem.url : urlItem;
					console.log(
						`${chalk.hex("#ff8000")('[RETRY]')} - ${chalk.magenta(this.fetcherName)} - Attempt ${attempt + 1} for ${identifier}`
					);
				}

				result = await this.fetchSingleUrl(urlItem);
				attempt++;

				if (!result.success && attempt <= maxRetries) {
					await this.delay(delayMs * attempt);
				}

			} while (!result.success && attempt <= maxRetries);

			results.push(result);

			if (i < urls.length - 1) {
				console.log(
					`${chalk.yellow('[DELAY]')} - ${chalk.magenta(this.fetcherName)} - Waiting ${delayMs}ms before next URL...`
				);
				await this.delay(delayMs);
			}
		}

		const endTime = Date.now();
		const totalTime = endTime - startTime;
		const successful = results.filter(r => r.success).length;
		const failed = results.filter(r => !r.success).length;

		const aggregatedData = results.reduce((accumulator, result) => {
			if (result.success && result.data) {
				if (Array.isArray(result.data)) {
					accumulator.push(...result.data);
				} else {
					accumulator.push(result.data);
				}
			}
			return accumulator;
		}, []);

		console.log(
			`${chalk.magenta('[COMPLETED]')} - ${chalk.magenta(this.fetcherName)} - Fetch with retry completed in ${chalk.cyan(totalTime + 'ms')}`
		);
		console.log(
			`${chalk.green('✓ Success:')} ${successful} | ${chalk.red('✗ Failed:')} ${failed}`
		);

		return {
			fetcherName: this.fetcherName,
			data: aggregatedData,
			results,
			summary: {
				total: urls.length,
				successful,
				failed,
				totalTimeMs: totalTime,
				averageTimePerRequest: Math.round(totalTime / urls.length),
				totalDataItems: aggregatedData.length
			}
		};
	}

	setUrls(urls) {
		if (!Array.isArray(urls)) {
			throw new Error('URLs must be an array');
		}

		for (const urlItem of urls) {
			if (typeof urlItem === 'string') {
				if (!this.isValidUrl(urlItem)) {
					throw new Error(`Invalid URL: ${urlItem}`);
				}
			} else if (typeof urlItem === 'object') {
				if (!urlItem.url) {
					throw new Error('URL object must have "url" property');
				}
				if (!this.isValidUrl(urlItem.url)) {
					throw new Error(`Invalid URL: ${urlItem.url}`);
				}
			} else {
				throw new Error('Each URL must be a string or an object with url property');
			}
		}

		this.fetchURLs = urls;
		console.log(
			`${chalk.blue('[CONFIG]')} - ${chalk.magenta(this.fetcherName)} - Updated URLs list with ${urls.length} endpoints`
		);
		return this;
	}

	setDelay(delayMs) {
		this.delayMs = delayMs;
		return this;
	}

	setName(name) {
		this.fetcherName = name;
		console.log(
			`${chalk.blue('[CONFIG]')} - Fetcher name set to: ${chalk.magenta(name)}`
		);
		return this;
	}
}

export async function fetchUrlsWithDelay(fetchURLs, delayMs = 1000) {
	const fetcher = new ApiFetcher();
	return await fetcher.fetchAllWithDelay(fetchURLs, delayMs);
}

export default ApiFetcher;