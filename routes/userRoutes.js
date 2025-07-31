// eletron-datalog-server/routes/userRoutes.js
import express from 'express';
import userController from '../controllers/UserController.js';
import UserFilterMetadataController from '../controllers/UserFilterMetadataController.js';
import checkToken from '../middleware/auth.js';

const router = express.Router();


// --- CORREÇÃO AQUI: ROTAS ESPECÍFICAS ANTES DAS GENÉRICAS ---

// NOVA ROTA: Obter metadados de filtro do usuário (específica, deve vir antes de /:id)
router.get('/filter-metadata', checkToken, UserFilterMetadataController.getUserMachinesMetadata);


// Rotas para configurações de gráfico (também são mais específicas que /:id para o userId)
router.get('/:userId/chart-configs', checkToken, userController.getChartConfigs);
router.post('/:userId/chart-configs', checkToken, userController.saveChartConfigs);

// Rotas de Usuário (GENÉRICA, para buscar um usuário por ID)
// Nota: a rota '/:id' aqui se refere ao userId, e é protegida
router.get('/:id', checkToken, userController.getUser);


export default router;