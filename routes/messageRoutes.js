import express from 'express';
import messageController from '../controllers/MessageController.js';
import checkToken from '../middleware/auth.js'; // Importa o middleware

const router = express.Router();

// Aplica o middleware checkToken a esta rota
router.get('/', checkToken, messageController.getMessages);
router.get('/api/messages', checkToken, messageController.getMessages);
router.get('/api/messages/messagesByDate', checkToken, messageController.getMessagesByDate);

export default router;