import pkg from "@prisma/client";

const { PrismaClient } = pkg;
import chalk from "chalk";

export class DatabaseService {
	constructor() {
		this.prisma = new PrismaClient({
			log: ['warn', 'error'],
			datasources: {
				db: {
					url: process.env.DATABASE_URL
				}
			}
		});

		this.connectionPool = {
			maxConnections: 20,
			idleTimeout: 30000,
			acquireTimeout: 60000
		};
	}

	async connect() {
		const maxRetries = 1;
		let attempt = 0;

		while (attempt <= maxRetries) {
			try {
				await this.prisma.$connect();
				console.log(
					`${chalk.black.bgMagenta(
						"[PRISMA]"
					)} - Postgres database Ready to use!`
				);
				return;
			} catch (error) {
				attempt++;

				if (attempt <= maxRetries) {
					console.log(
						`${chalk.black.bgYellow(
							"[PRISMA]"
						)} - Attempt ${attempt} failed, retry in 2 seconds ...`
					);
					await new Promise(resolve => setTimeout(resolve, 2000));
				} else {
					console.log(
						`${chalk.black.bgRed(
							"[PRISMA]"
						)} - Postgres database Failed to connect after ${attempt} attempts!`
					);
					process.exit(1);
				}
			}
		}
	}

	async disconnect() {
		await this.prisma.$disconnect();
	}

	async getAllPlayers() {
		try {
			return await this.prisma.Players.findMany();
		} catch (error) {
			console.error(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Error fetching all players:`,
				error
			);
			throw error;
		}
	}

	async getPlayerById(id) {
		try {
			return await this.prisma.Players.findUnique({
				where: {
					id: parseInt(id)
				}
			});
		} catch (error) {
			console.error(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Error fetching player by ID:`,
				error
			);
			throw error;
		}
	}

	async getPlayerByUid(Uid) {
		try {
			return await this.prisma.Players.findUnique({
				where: { Uid: Uid }
			});
		} catch (error) {
			console.error(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Error fetching player by UID:`,
				error
			);
			throw error;
		}
	}

	async getPlayersByUsername(Username) {
		try {
			return await this.prisma.Players.findMany({
				where: { Username: Username }
			});
		} catch (error) {
			console.error(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Error fetching players by Username:`,
				error
			);
			throw error;
		}
	}

	async getPlayersByCrew(Crew) {
		try {
			return await this.prisma.Players.findMany({
				where: { Crew: Crew }
			});
		} catch (error) {
			console.error(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Error fetching players by Crew:`,
				error
			);
			throw error;
		}
	}

	async searchPlayers(filters = {}) {
		try {
			const whereClause = {};

			if (filters.Username) {
				whereClause.Username = filters.Username;
			}

			if (filters.Uid) {
				whereClause.Uid = filters.Uid;
			}

			const [players, servers] = await Promise.all([
				this.prisma.Players.findMany({
					where: whereClause,
					orderBy: filters.orderBy || { id: 'asc' }
				}),
				this.prisma.Servers.findMany()
			]);

			// Mapper chaque joueur avec son serveur
			const playersWithServer = players.map((player) => {
				const server = servers.find((s) => {
					const playersList = Array.isArray(s.players) ? s.players : [];
					return playersList.some(
						(p) => p.uid === player.Uid && p.Username === player.Username
					);
				});

				return {
					...player,
					server: !server?.sId ? null : {
						sId: server?.sId,
						time: server?.time,
						restartAt: server?.restartAt
					}
				};
			});

			return playersWithServer;
		} catch (error) {
			console.error(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Error searching players:`,
				error
			);
			throw error;
		}
	}

	async upsertPlayer(playerData) {
		try {
			const { Uid, Username, Crew, Timestamp } = playerData;

			if (!Uid) {
				throw new Error('UID is required for upsert operation');
			}

			const player = await this.prisma.Players.upsert({
				where: {
					Uid: Uid
				},
				update: {
					Username: Username || null,
					Crew: Crew || null,
					LastSeen: Timestamp || null
				},
				create: {
					Uid: Uid,
					Username: Username || null,
					Crew: Crew || null,
					LastSeen: Timestamp || null
				}
			});

			console.log(
				`${chalk.black.bgGreen(
					"[PRISMA]"
				)} - Player upserted successfully: ${Uid}`
			);

			return player;
		} catch (error) {
			console.error(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Error upserting player:`,
				error
			);
			throw error;
		}
	}

	// Servers

	async getAllServers() {
		try {
			return await this.prisma.Servers.findMany({
				select: {
					id: true,
					sId: true,
					time: true,
					restartAt: true,
					players: false
				}
			});
		} catch (error) {
			console.error(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Error fetching all servers:`,
				error
			);
			throw error;
		}
	}

	async getServerById(serverId) {
		return this.prisma.Servers.findFirst({
			select: {
				id: true,
				sId: true,
				time: true,
				restartAt: true,
				players: true
			},
			where: { sId: serverId }
		});
	}

	// Database service methods
	async getLastFetch() {
		try {
			return await this.prisma.SystemMetadata.findUnique({
				where: { key: 'players_last_fetch' }
			});
		} catch (error) {
			console.error(
				`${chalk.black.bgRed("[PRISMA]")} - Error fetching last fetch metadata:`,
				error
			);
			throw error;
		}
	}

	async upsertLastFetch() {
		try {
			return await this.prisma.SystemMetadata.upsert({
				where: { key: 'players_last_fetch' },
				update: {
					lastFetch: new Date(),
					value: 'success'
				},
				create: {
					key: 'players_last_fetch',
					lastFetch: new Date(),
					value: 'success',
					description: 'Last synchronization of players'
				}
			});
		} catch (error) {
			console.error(
				`${chalk.black.bgRed("[PRISMA]")} - Error upserting last fetch metadata:`,
				error
			);
			throw new Error('Failed to update last fetch metadata');
		}
	}

	async upsertPlayersOptimizedNative(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			const startTime = Date.now();
			console.log(`${chalk.black.bgBlue("[PRISMA]")} - Starting optimized native upsert for ${playersData.length} players`);

			const values = playersData.map(player => {
				const { Uid, Username, Crew, Timestamp } = player;
				return `('${Uid}', ${Username ? `'${Username.replace(/'/g, "''")}'` : 'NULL'}, ${Crew ? `'${Crew.replace(/'/g, "''")}'` : 'NULL'}, ${Timestamp ? `'${Timestamp.toISOString()}'` : 'NULL'})`;
			}).join(',\n');

			const query = `
                INSERT INTO "Players" ("Uid", "Username", "Crew", "LastSeen")
                VALUES ${values} ON CONFLICT ("Uid") 
				DO
                UPDATE SET
                    "Username" = EXCLUDED."Username",
                    "Crew" = EXCLUDED."Crew",
                    "LastSeen" = EXCLUDED."LastSeen",
                    "updatedAt" = NOW()
                    RETURNING *;
			`;

			const result = await this.prisma.$queryRawUnsafe(query);

			const processingTime = Date.now() - startTime;
			console.log(`${chalk.black.bgGreen("[PRISMA]")} - Native upsert completed: ${result.length} players in ${processingTime}ms`);

			return result;

		} catch (error) {
			console.error(`${chalk.black.bgRed("[PRISMA]")} - Error in native optimized upsert:`, error);
			throw error;
		}
	}

	async upsertPlayersTransaction(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			const startTime = Date.now();

			// Utiliser un timeout plus long pour les transactions
			const results = await this.prisma.$transaction(
				playersData.map(playerData => {
					const { Uid, Username, Crew, Timestamp } = playerData;

					if (!Uid) {
						throw new Error(`UID is required for player: ${JSON.stringify(playerData)}`);
					}

					return this.prisma.Players.upsert({
						where: { Uid },
						update: {
							Username: Username || null,
							Crew: Crew || null,
							LastSeen: Timestamp || null
						},
						create: {
							Uid,
							Username: Username || null,
							Crew: Crew || null,
							LastSeen: Timestamp || null
						}
					});
				}),
				{
					timeout: 60000,
					isolationLevel: 'ReadCommitted'
				}
			);

			const processingTime = Date.now() - startTime;
			console.log(`${chalk.black.bgGreen("[PRISMA]")} - ${results.length} players upserted in transaction (${processingTime}ms)`);

			return results;
		} catch (error) {
			console.error(`${chalk.black.bgRed("[PRISMA]")} - Error upserting players in transaction:`, error);
			throw error;
		}
	}

	async upsertPlayersOptimized(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			const startTime = Date.now();

			if (playersData.length > 500) {
				console.log(`${chalk.black.bgYellow("[PRISMA]")} - Large dataset detected (${playersData.length}), using native SQL`);
				return await this.upsertPlayersOptimizedNative(playersData);
			}

			const chunkSize = 50;
			const chunks = [];

			for (let i = 0; i < playersData.length; i += chunkSize) {
				chunks.push(playersData.slice(i, i + chunkSize));
			}

			console.log(`${chalk.black.bgBlue("[PRISMA]")} - Processing ${playersData.length} players in ${chunks.length} chunks of ${chunkSize}`);

			let totalResults = [];
			let successfulChunks = 0;
			let failedChunks = 0;

			for (let i = 0; i < chunks.length; i++) {
				const chunk = chunks[i];
				const chunkStart = Date.now();

				try {
					const chunkResults = await this.prisma.$transaction(
						chunk.map(playerData => {
							const { Uid, Username, Crew, Timestamp } = playerData;

							if (!Uid) {
								throw new Error(`UID is required for player: ${JSON.stringify(playerData)}`);
							}

							return this.prisma.Players.upsert({
								where: { Uid: Uid },
								update: {
									Username: Username || null,
									Crew: Crew || null,
									LastSeen: Timestamp || null
								},
								create: {
									Uid: Uid,
									Username: Username || null,
									Crew: Crew || null,
									LastSeen: Timestamp || null
								}
							});
						}),
						{
							timeout: 30000, // 30 secondes par chunk
							isolationLevel: 'ReadCommitted'
						}
					);

					totalResults = totalResults.concat(chunkResults);
					successfulChunks++;

					const chunkTime = Date.now() - chunkStart;
					console.log(`${chalk.black.bgGreen("[PRISMA]")} - Chunk ${i + 1}/${chunks.length} completed (${chunk.length} players in ${chunkTime}ms)`);

					if (i < chunks.length - 1) {
						await new Promise(resolve => setTimeout(resolve, 10));
					}

				} catch (error) {
					failedChunks++;
					console.error(`${chalk.black.bgRed("[PRISMA]")} - Chunk ${i + 1} failed:`, error.message);
				}
			}

			const totalTime = Date.now() - startTime;
			console.log(`${chalk.black.bgGreen("[PRISMA]")} - Completed: ${totalResults.length} players processed (${successfulChunks}/${chunks.length} chunks successful) in ${totalTime}ms`);

			if (failedChunks > 0) {
				console.warn(`${chalk.black.bgYellow("[PRISMA]")} - Warning: ${failedChunks} chunks failed`);
			}

			return totalResults;

		} catch (error) {
			console.error(`${chalk.black.bgRed("[PRISMA]")} - Error in optimized upsert:`, error);
			throw error;
		}
	}

	async bulkUpsertPlayers(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			const startTime = Date.now();
			console.log(`${chalk.black.bgBlue("[PRISMA]")} - Starting bulk upsert for ${playersData.length} players`);

			const existingUids = await this.prisma.Players.findMany({
				where: {
					Uid: {
						in: playersData.map(p => p.Uid)
					}
				},
				select: { Uid: true }
			});

			const existingUidSet = new Set(existingUids.map(p => p.Uid));

			const toCreate = playersData.filter(p => !existingUidSet.has(p.Uid));
			const toUpdate = playersData.filter(p => existingUidSet.has(p.Uid));

			let createdCount = 0;
			let updatedCount = 0;

			if (toCreate.length > 0) {
				const createData = toCreate.map(({ Uid, Username, Crew, Timestamp }) => ({
					Uid,
					Username: Username || null,
					Crew: Crew || null,
					LastSeen: Timestamp || null
				}));

				const created = await this.prisma.Players.createMany({
					data: createData,
					skipDuplicates: true
				});

				createdCount = created.count;
			}

			if (toUpdate.length > 0) {
				for (const { Uid, Username, Crew, Timestamp } of toUpdate) {
					await this.prisma.Players.update({
						where: { Uid },
						data: {
							Username: Username || null,
							Crew: Crew || null,
							LastSeen: Timestamp || null
						}
					});
					updatedCount++;
				}
			}

			const totalTime = Date.now() - startTime;
			console.log(`${chalk.black.bgGreen("[PRISMA]")} - Bulk upsert completed: ${createdCount} created, ${updatedCount} updated in ${totalTime}ms`);

			return { created: createdCount, updated: updatedCount, total: createdCount + updatedCount };

		} catch (error) {
			console.error(`${chalk.black.bgRed("[PRISMA]")} - Error in bulk upsert:`, error);
			throw error;
		}
	}

	// async upsertPlayers(playersData) {
	// 	console.log(`${chalk.black.bgYellow("[PRISMA]")} - Using legacy upsertPlayers method. Consider using optimized methods.`);
	// 	return await this.upsertPlayersTransaction(playersData);
	// }
}

export default DatabaseService;