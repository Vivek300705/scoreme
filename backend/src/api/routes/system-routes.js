import { Router } from 'express';
import * as systemController from '../controllers/system-controller.js';

const router = Router();

router.get('/health', systemController.getHealth);
router.get('/metrics', systemController.getMetrics);

export default router;

