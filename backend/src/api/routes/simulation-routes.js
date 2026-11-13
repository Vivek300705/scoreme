import { Router } from 'express';
import * as simulationController from '../controllers/simulation-controller.js';

const router = Router();

router.get('/failure-mode', simulationController.getFailureMode);
router.post('/failure-mode', simulationController.setFailureMode);

export default router;

