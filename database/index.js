import pkg from "@prisma/client";
const {PrismaClient} = pkg;
import chalk from "chalk";

export class DatabaseService {
	constructor() {
		this.prisma = new PrismaClient({
			log: ['warn', 'error'],
		});
	}

	async connect() {
		try {
			await this.prisma.$connect();
			console.log(
				`${chalk.black.bgMagenta(
					"[PRISMA]"
				)} - SQLite database Ready to use!`
			);
		} catch (error) {
			console.log(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - SQLite database Failed to connect!`
			);
			process.exit(1);
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
				where: {Uid: Uid}
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
				where: {Username: Username}
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
				where: {Crew: Crew}
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

			if(filters.id) {
				whereClause.id = filters.id;
			}

			if (filters.Username) {
				whereClause.Username = {
					contains: filters.Username
				};
			}

			if (filters.Uid) {
				whereClause.Uid = filters.Uid;
			}

			return await this.prisma.Players.findMany({
				where: whereClause,
				orderBy: filters.orderBy || {id: 'asc'}
			});
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
			// Extraction correcte des données imbriquées
			const { Uid, Username, Crew, sId, Timestamp } = playerData;

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

	// Upsert multiple players (batch operation)
	async upsertPlayers(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			const results = [];

			for (const playerData of playersData) {
				const result = await this.upsertPlayer(playerData);
				results.push(result);
			}

			console.log(
				`${chalk.black.bgGreen(
					"[PRISMA]"
				)} - ${results.length} players upserted successfully`
			);

			return results;
		} catch (error) {
			console.error(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Error upserting players:`,
				error
			);
			throw error;
		}
	}

	async upsertPlayersTransaction(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			const results = await this.prisma.$transaction(
				playersData.map(playerData => {
					// Extraction correcte des données imbriquées
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
				})
			);

			console.log(
				`${chalk.black.bgGreen(
					"[PRISMA]"
				)} - ${results.length} players upserted in transaction`
			);

			return results;
		} catch (error) {
			console.error(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Error upserting players in transaction:`,
				error
			);
			throw error;
		}
	}

	async upsertPlayersOptimized(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			// Diviser en chunks pour éviter les timeouts sur de gros volumes
			const chunkSize = 100;
			const chunks = [];

			for (let i = 0; i < playersData.length; i += chunkSize) {
				chunks.push(playersData.slice(i, i + chunkSize));
			}

			console.log(
				`${chalk.black.bgBlue("[PRISMA]")} - Processing ${playersData.length} players in ${chunks.length} chunks of ${chunkSize}`
			);

			let totalResults = [];

			for (let i = 0; i < chunks.length; i++) {
				const chunk = chunks[i];

				const chunkResults = await this.prisma.$transaction(
					chunk.map(playerData => {
						// Extraction correcte des données imbriquées
						const { Uid, Username, Crew, sId, Timestamp } = playerData;

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
					})
				);

				totalResults = totalResults.concat(chunkResults);

				console.log(
					`${chalk.black.bgGreen("[PRISMA]")} - Chunk ${i + 1}/${chunks.length} completed (${chunk.length} players)`
				);
			}

			console.log(
				`${chalk.black.bgGreen("[PRISMA]")} - All ${totalResults.length} players upserted successfully`
			);

			return totalResults;

		} catch (error) {
			console.error(
				`${chalk.black.bgRed("[PRISMA]")} - Error in optimized upsert:`, error
			);
			throw error;
		}
	}
}

export default DatabaseService;