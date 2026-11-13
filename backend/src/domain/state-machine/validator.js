import { canTransition } from './transitions.js';

export class InvalidStateTransitionError extends Error {
  constructor(fromState, toState, reason) {
    super(
      `Illegal workflow state transition: cannot transition from "${fromState}" to "${toState}". ${reason || ''}`.trim()
    );
    this.name = 'InvalidStateTransitionError';
    this.statusCode = 400;
    this.fromState = fromState;
    this.toState = toState;
  }
}

/**
 * Validates state transition, throwing InvalidStateTransitionError if illegal.
 * @param {string} fromState
 * @param {string} toState
 * @param {string} [contextMessage]
 */
export function validateStateTransition(fromState, toState, contextMessage = '') {
  if (!canTransition(fromState, toState)) {
    throw new InvalidStateTransitionError(fromState, toState, contextMessage);
  }
}

