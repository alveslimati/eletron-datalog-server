import { Router } from 'express';
import MessageController from '../controllers/MessageController.js';
import checkToken from '../middleware/checkToken.js'; // Se você tiver outro middleware

const router = Router();

router.get('/api/messages', checkToken, MessageController.getMessages);
router.get('/api/messages/getMessagesByDate', checkToken, MessageController.getMessagesByDate);

export default router;