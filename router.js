import express from 'express';
import DatabaseService from "./database/index.js";

const router = express.Router();

const dbService = new DatabaseService();

// Router endpoint

router.use((err, req, res) => {
	console.error('Error in the Router:', err);
	res.status(500).json({error: 'Internal server error.'});
});

export default router;