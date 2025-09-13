import express from 'express';
import DatabaseService from "./database/index.js";

const router = express.Router();

const dbService = new DatabaseService();

// Router endpoint
router.get("/players/info", async (req, res) => {
	const { id, uid, username } = req.query;

	// Validate that at least one search parameter is provided
	if (!id && !uid && !username) {
		return res.status(400).json({
			error: "Please specify either 'id', 'uid', or 'username' for the search."
		});
	}

	try {
		// Build where clause with proper validation
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

		if (uid) {
			// Add basic uid validation if needed
			where.Uid = uid;
		}

		if (username) {
			// Add basic username validation if needed
			where.Username = username;
		}

		// Execute both queries
		const [players, lastFetchData] = await Promise.all([
			dbService.searchPlayers(where),
			dbService.getLastFetch()
		]);

		// Structure the response clearly
		const response = {
			...players[0],
			lastFetch: lastFetchData?.lastFetch || null
		};

		res.status(200).json(response);

	} catch (error) {
		console.error('Error in /players/info endpoint:', error);
		res.status(500).json({
			error: "Internal server error.",
			...(process.env.NODE_ENV === 'development' && { details: error.message })
		});
	}
});

router.use((err, req, res) => {
	console.error('Error in the Router:', err);
	res.status(500).json({error: 'Internal server error.'});
});

export default router;