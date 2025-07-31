// src/routes/authRoutes.js
import express from 'express';
// Supondo que as funções de login/registro estão em UserController
import { loginUser, registerUser } from '../controllers/UserController.js'; 

const router = express.Router();

router.post('/login', loginUser);
router.post('/register', registerUser);

export default router;