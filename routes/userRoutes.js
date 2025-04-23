import express from 'express';
import UserController from '../controllers/userController.js';

const router = express.Router();

// Rotas relacionadas ao usuário
router.post('/register', UserController.register);
router.post('/login', UserController.login);
router.get('/:id', UserController.getUser);

export default router;