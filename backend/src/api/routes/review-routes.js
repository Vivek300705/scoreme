import { Router } from 'express';
import * as reviewController from '../controllers/review-controller.js';

const router = Router();

router.get('/', reviewController.listPendingReviews);
router.post('/:id', reviewController.submitReviewDecision);

export default router;

