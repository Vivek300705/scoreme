import { Router } from 'express';
import workflowRoutes from './workflow-routes.js';
import executionRoutes from './execution-routes.js';
import reviewRoutes from './review-routes.js';
import simulationRoutes from './simulation-routes.js';
import systemRoutes from './system-routes.js';

const router = Router();

router.use('/workflows', workflowRoutes);
router.use('/executions', executionRoutes);
router.use('/reviews', reviewRoutes);
router.use('/simulation', simulationRoutes);
router.use('/', systemRoutes);

export default router;

