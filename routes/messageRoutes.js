import express from 'express';
import messageController from '../controllers/MessageController.js';

const router = express.Router();

router.get('/', messageController.getMessages);

export default router;