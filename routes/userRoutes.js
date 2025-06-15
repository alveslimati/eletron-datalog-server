import express from 'express';
import userController from '../controllers/UserController.js';
const router = express.Router();
import checkToken from '../middleware/auth.js';

router.post('/register', userController.register);
router.post('/login', userController.login);
router.get('/:id', checkToken, userController.getUser);
router.get('/:userId/chart-configs', checkToken, userController.getChartConfigs);
router.post('/:userId/chart-configs', checkToken, userController.saveChartConfigs);

export default router;