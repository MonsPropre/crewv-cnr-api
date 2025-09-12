import pkg from "@prisma/client";

const {PrismaClient} = pkg;
import chalk from "chalk";

export class DatabaseService {
	constructor() {
		this.prisma = new PrismaClient({
			log: ['warn', 'error'],
			// Optimisations de connexion
			datasources: {
				db: {
					url: process.env.DATABASE_URL
				}
			}
		});

		// Pool de connexions et cache de requêtes
		this.connectionPool = {
			maxConnections: 20,
			idleTimeout: 30000,
			acquireTimeout: 60000
		};
	}

	async connect() {
		try {
			await this.prisma.$connect();
			console.log(
				`${chalk.black.bgMagenta(
					"[PRISMA]"
				)} - Postgres database Ready to use!`
			);
		} catch (error) {
			console.log(
				`${chalk.black.bgRed(
					"[PRISMA]"
				)} - Postgres database Failed to connect!`
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

			if (filters.id) {
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
			const {Uid, Username, Crew, sId, Timestamp} = playerData;

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

	// MÉTHODE OPTIMISÉE : Utilise des requêtes SQL natives pour de meilleures performances
	async upsertPlayersOptimizedNative(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			const startTime = Date.now();
			console.log(`${chalk.black.bgBlue("[PRISMA]")} - Starting optimized native upsert for ${playersData.length} players`);

			// Préparer les données pour la requête SQL native
			const values = playersData.map(player => {
				const {Uid, Username, Crew, Timestamp} = player;
				return `('${Uid}', ${Username ? `'${Username.replace(/'/g, "''")}'` : 'NULL'}, ${Crew ? `'${Crew.replace(/'/g, "''")}'` : 'NULL'}, ${Timestamp ? `'${Timestamp.toISOString()}'` : 'NULL'})`;
			}).join(',\n');

			// Requête SQL native optimisée avec ON CONFLICT
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

	// MÉTHODE AMÉLIORÉE : Transaction avec chunks plus petits et timeout personnalisé
	async upsertPlayersTransaction(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			const startTime = Date.now();

			// Utiliser un timeout plus long pour les transactions
			const results = await this.prisma.$transaction(
				playersData.map(playerData => {
					const {Uid, Username, Crew, Timestamp} = playerData;

					if (!Uid) {
						throw new Error(`UID is required for player: ${JSON.stringify(playerData)}`);
					}

					return this.prisma.Players.upsert({
						where: {Uid},
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
					timeout: 60000, // 60 secondes de timeout
					isolationLevel: 'ReadCommitted' // Niveau d'isolation moins strict
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

	// MÉTHODE CORRIGÉE : Chunks plus petits et gestion d'erreur améliorée
	async upsertPlayersOptimized(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			const startTime = Date.now();

			// Pour de très gros volumes, utiliser la méthode native
			if (playersData.length > 500) {
				console.log(`${chalk.black.bgYellow("[PRISMA]")} - Large dataset detected (${playersData.length}), using native SQL`);
				return await this.upsertPlayersOptimizedNative(playersData);
			}

			// Chunks plus petits pour éviter les timeouts
			const chunkSize = 50; // Réduit de 100 à 50
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
							const {Uid, Username, Crew, sId, Timestamp} = playerData;

							if (!Uid) {
								throw new Error(`UID is required for player: ${JSON.stringify(playerData)}`);
							}

							return this.prisma.Players.upsert({
								where: {Uid: Uid},
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

					// Petit délai entre les chunks pour réduire la charge
					if (i < chunks.length - 1) {
						await new Promise(resolve => setTimeout(resolve, 10));
					}

				} catch (error) {
					failedChunks++;
					console.error(`${chalk.black.bgRed("[PRISMA]")} - Chunk ${i + 1} failed:`, error.message);

					// Continuer avec les autres chunks au lieu d'arrêter complètement
					continue;
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

	// NOUVELLE MÉTHODE : Bulk upsert avec createMany + updateMany (plus rapide)
	async bulkUpsertPlayers(playersData) {
		try {
			if (!Array.isArray(playersData) || playersData.length === 0) {
				throw new Error('Players data must be a non-empty array');
			}

			const startTime = Date.now();
			console.log(`${chalk.black.bgBlue("[PRISMA]")} - Starting bulk upsert for ${playersData.length} players`);

			// Étape 1: Récupérer tous les UIDs existants
			const existingUids = await this.prisma.Players.findMany({
				where: {
					Uid: {
						in: playersData.map(p => p.Uid)
					}
				},
				select: {Uid: true}
			});

			const existingUidSet = new Set(existingUids.map(p => p.Uid));

			// Étape 2: Séparer les nouvelles entrées des mises à jour
			const toCreate = playersData.filter(p => !existingUidSet.has(p.Uid));
			const toUpdate = playersData.filter(p => existingUidSet.has(p.Uid));

			let createdCount = 0;
			let updatedCount = 0;

			// Étape 3: Créer les nouveaux joueurs en batch
			if (toCreate.length > 0) {
				const createData = toCreate.map(({Uid, Username, Crew, Timestamp}) => ({
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

			// Étape 4: Mettre à jour les joueurs existants
			if (toUpdate.length > 0) {
				for (const {Uid, Username, Crew, Timestamp} of toUpdate) {
					await this.prisma.Players.update({
						where: {Uid},
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

			return {created: createdCount, updated: updatedCount, total: createdCount + updatedCount};

		} catch (error) {
			console.error(`${chalk.black.bgRed("[PRISMA]")} - Error in bulk upsert:`, error);
			throw error;
		}
	}

	// Upsert multiple players (ancienne méthode - gardée pour compatibilité)
	async upsertPlayers(playersData) {
		console.log(`${chalk.black.bgYellow("[PRISMA]")} - Using legacy upsertPlayers method. Consider using optimized methods.`);
		return await this.upsertPlayersTransaction(playersData);
	}
}

export default DatabaseService;