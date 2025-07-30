import express from 'express';
import MessageRealTimeController from '../controllers/MessageRealTimeController.js';

const router = express.Router();

router.get('/', MessageRealTimeController.getMessages);

export default router;