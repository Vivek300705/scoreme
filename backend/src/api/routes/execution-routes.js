import { Router } from 'express';
import * as executionController from '../controllers/execution-controller.js';
import * as reviewController from '../controllers/review-controller.js';

const router = Router();

router.get('/', executionController.listExecutions);
router.get('/:id', executionController.getExecution);
router.get('/:id/history', executionController.getExecutionHistory);
router.get('/:id/explanation', executionController.getExecutionExplanation);
router.post('/:id/review', reviewController.submitReviewDecision);

export default router;

