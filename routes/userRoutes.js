import express from 'express';
import userController from '../controllers/UserController.js';
    
const router = express.Router();

// Rotas relacionadas ao usuário
router.post('/register', userController.register);
router.post('/login', userController.login);
router.get('/:id', userController.getUser);

export default router;