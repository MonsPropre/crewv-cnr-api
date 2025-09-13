import chalk from "chalk";

export class ProcessLock {
	constructor() {
		this.locks = new Set();
		this.isShuttingDown = false;
		this.setupGracefulShutdown();
	}

	acquire(lockId) {
		this.locks.add(lockId);
		return lockId;
	}

	release(lockId) {
		if (this.locks.has(lockId)) {
			this.locks.delete(lockId);
			if (this.isShuttingDown && this.locks.size === 0) {
				console.log(
					`${chalk.green('[SUCCESS]')} - Released all locks, process stopping`
				);
				process.exit(0);
			}
		}
	}

	hasLocks() {
		return this.locks.size > 0;
	}

	getActiveLocks() {
		return Array.from(this.locks);
	}

	setupGracefulShutdown() {
		const gracefulShutdown = async (signal) => {
			console.log(`${chalk.yellow('[WARN]')} - Signal ${signal} received`);
			this.isShuttingDown = true;

			if (this.hasLocks()) {
				console.log(
					`${chalk.red('[FAIL]')} - Process Locked: ${this.getActiveLocks().join(', ')}`
				);
				console.log(
					`${chalk.yellow('[DELAY]')} - Awaiting the release of locks...`
				);
				await this.waitForUnlock();
			}

			process.exit(0);
		};
		process.on('SIGINT', gracefulShutdown);
		process.on('SIGTERM', gracefulShutdown);
	}

	async waitForUnlock() {
		return new Promise((resolve) => {
			const checkLocks = () => {
				if (!this.hasLocks()) {
					resolve();
				} else {
					setTimeout(checkLocks, 200);
				}
			};
			checkLocks();
		});
	}
}