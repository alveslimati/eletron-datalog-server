// routes/messageRoutes.js
import express from 'express';
import messageController from '../controllers/MessageController.js';
import checkToken from '../middleware/auth.js'; // Importa o middleware

const router = express.Router();

// Aplica o middleware checkToken a esta rota
router.get('/', checkToken, messageController.getMessages);
router.get('/api/messages', checkToken, MessageController.getMessages);
router.get('/api/messagesByDate', checkToken, MessageController.getMessagesByDate);


export default router;