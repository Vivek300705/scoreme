import { Router } from 'express';
import * as workflowController from '../controllers/workflow-controller.js';
import * as executionController from '../controllers/execution-controller.js';
import { validateWorkflowInput } from '../middlewares/request-validator.js';

const router = Router();

router.get('/', workflowController.listWorkflows);
router.post('/', workflowController.createWorkflow);
router.get('/:id', workflowController.getWorkflow);
router.get('/:id/versions', workflowController.getWorkflowVersions);
router.post('/:id/activate', workflowController.activateWorkflowVersion);

// Workflow Execution
router.post('/:id/execute', validateWorkflowInput, executionController.executeWorkflow);

export default router;

