import express from 'express';
import DatabaseService from "./database/index.js";

const router = express.Router();

const dbService = new DatabaseService();

router.get('/', (req, res) => {
	res.json({
		message: 'Welcome on the API',
		timestamp: new Date().toISOString()
	});
});

router.get("/players/info", async (req, res) => {
	const { id, uid, username } = req.query;

	if (!id && !uid && !username) {
		return res.status(400).json({ error: "Please specify either 'id' or 'uid' or 'username' for the search." });
	}

	try {
		const where = {};
		if (id && !isNaN(Number(id))) where.id = Number(id);
		if (uid) where.Uid = uid;
		if (username) where.Username = username;

		const players = await dbService.searchPlayers(where);
		// const players = await prisma.PlayersUptime.findMany({
		// 	where,
		// 	take: 1,
		// 	select: {
		// 		id: true,
		// 		Uid: true,
		// 		Username: true,
		// 		Crew: true
		// 	}
		// });

		// if (players?.length <= 0) {
		// 	return res.status(404).json({ message: "No player found." });
		// }

		res.status(200).json(players);
	} catch (error) {
		res.status(500).json({ error: "Internal server error." });
	}
});

router.use((err, req, res, next) => {
	console.error('Erreur dans le router:', err);
	res.status(500).json({ error: 'Erreur interne du serveur' });
});

export default router;