import express from 'express';
import MessageRealTimeController from '../controllers/MessageRealTimeController.js';
import checkToken from '../middleware/checkToken.js';

const router = express.Router();

router.post('/', checkToken, MessageRealTimeController.getRealTimeMessages);

export default router;