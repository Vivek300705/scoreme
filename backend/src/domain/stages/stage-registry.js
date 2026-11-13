import { RuleEvaluationStage } from './rule-evaluation-stage.js';
import { ExternalVerificationStage } from './external-verification-stage.js';
import { ManualReviewStage } from './manual-review-stage.js';
import { FinalDecisionStage } from './final-decision-stage.js';

class StageRegistry {
  constructor() {
    this.stageTypes = new Map();

    // Register built-in stages
    this.register('rule_evaluation', RuleEvaluationStage);
    this.register('external_verification', ExternalVerificationStage);
    this.register('manual_review', ManualReviewStage);
    this.register('final_decision', FinalDecisionStage);
  }

  register(type, stageClass) {
    this.stageTypes.set(type, stageClass);
  }

  createStage(stageConfig) {
    const StageClass = this.stageTypes.get(stageConfig.type);
    if (!StageClass) {
      throw new Error(`Unknown stage type: "${stageConfig.type}" for stage id: "${stageConfig.id}"`);
    }
    return new StageClass(stageConfig);
  }

  has(type) {
    return this.stageTypes.has(type);
  }
}

export const stageRegistry = new StageRegistry();

