import express from 'express';
import Message2Controller from '../controllers/Message2Controller.js';

const router = express.Router();

router.get('/', Message2Controller.getMessages);

export default router;