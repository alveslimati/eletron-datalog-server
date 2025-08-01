// src/routes/authRoutes.js
import express from 'express';
import UserController from '../controllers/UserController.js'; 

const router = express.Router();

// Correção aqui: use os nomes exatos das funções do seu controller
router.post('/login', UserController.login);
router.post('/register', UserController.register);

export default router;