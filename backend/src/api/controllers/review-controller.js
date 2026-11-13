import { db } from '../../infrastructure/database/store.js';
import { workflowOrchestrator } from '../../domain/engine/workflow-orchestrator.js';

export async function listPendingReviews(req, res, next) {
  try {
    const pending = await db.getPendingReviews();
    res.json({ data: pending });
  } catch (err) {
    next(err);
  }
}

export async function submitReviewDecision(req, res, next) {
  try {
    const { id } = req.params;
    const { decision, reviewerId, reviewerNotes } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be either "APPROVED" or "REJECTED"' });
    }

    const updated = await workflowOrchestrator.resolveReview(
      id,
      decision,
      reviewerId || 'underwriter-admin',
      reviewerNotes || 'Approved via manual review console'
    );

    res.json({
      message: `Execution ${id} successfully resolved with decision ${decision}`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

