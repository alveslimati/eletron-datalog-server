// routes/messageRealTimeRoutes.js
import express from 'express';
import MessageRealTimeController from '../controllers/MessageRealTimeController.js';
import checkToken from '../middleware/auth.js';

const router = express.Router();

router.post('/', checkToken, MessageRealTimeController.getRealTimeMessages);

export default router;