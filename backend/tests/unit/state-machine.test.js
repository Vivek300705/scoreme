import { WORKFLOW_STATES, isTerminalState } from '../../src/domain/state-machine/states.js';
import { canTransition } from '../../src/domain/state-machine/transitions.js';
import { validateStateTransition, InvalidStateTransitionError } from '../../src/domain/state-machine/validator.js';

describe('Domain: State Machine Unit Tests', () => {
  test('identifies terminal states correctly', () => {
    expect(isTerminalState(WORKFLOW_STATES.APPROVED)).toBe(true);
    expect(isTerminalState(WORKFLOW_STATES.REJECTED)).toBe(true);
    expect(isTerminalState(WORKFLOW_STATES.FAILED)).toBe(true);
    expect(isTerminalState(WORKFLOW_STATES.PROCESSING)).toBe(false);
    expect(isTerminalState(WORKFLOW_STATES.MANUAL_REVIEW)).toBe(false);
  });

  test('permits valid linear and branching state transitions', () => {
    expect(canTransition(WORKFLOW_STATES.RECEIVED, WORKFLOW_STATES.VALIDATED)).toBe(true);
    expect(canTransition(WORKFLOW_STATES.VALIDATED, WORKFLOW_STATES.PROCESSING)).toBe(true);
    expect(canTransition(WORKFLOW_STATES.PROCESSING, WORKFLOW_STATES.APPROVED)).toBe(true);
    expect(canTransition(WORKFLOW_STATES.PROCESSING, WORKFLOW_STATES.REJECTED)).toBe(true);
    expect(canTransition(WORKFLOW_STATES.PROCESSING, WORKFLOW_STATES.MANUAL_REVIEW)).toBe(true);
    expect(canTransition(WORKFLOW_STATES.PROCESSING, WORKFLOW_STATES.RETRY_PENDING)).toBe(true);
    expect(canTransition(WORKFLOW_STATES.RETRY_PENDING, WORKFLOW_STATES.PROCESSING)).toBe(true);
    expect(canTransition(WORKFLOW_STATES.MANUAL_REVIEW, WORKFLOW_STATES.APPROVED)).toBe(true);
    expect(canTransition(WORKFLOW_STATES.MANUAL_REVIEW, WORKFLOW_STATES.REJECTED)).toBe(true);
  });

  test('forbids illegal backwards and terminal transitions', () => {
    // Cannot transition backwards from APPROVED or REJECTED
    expect(canTransition(WORKFLOW_STATES.APPROVED, WORKFLOW_STATES.PROCESSING)).toBe(false);
    expect(canTransition(WORKFLOW_STATES.REJECTED, WORKFLOW_STATES.APPROVED)).toBe(false);
    expect(canTransition(WORKFLOW_STATES.FAILED, WORKFLOW_STATES.PROCESSING)).toBe(false);

    // Cannot jump straight from RECEIVED to APPROVED
    expect(canTransition(WORKFLOW_STATES.RECEIVED, WORKFLOW_STATES.APPROVED)).toBe(false);
  });

  test('validateStateTransition throws InvalidStateTransitionError on illegal move', () => {
    expect(() => {
      validateStateTransition(WORKFLOW_STATES.APPROVED, WORKFLOW_STATES.RECEIVED, 'Reset attempt');
    }).toThrow(InvalidStateTransitionError);
  });
});

