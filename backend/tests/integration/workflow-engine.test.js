import request from 'supertest';
import { app } from '../../src/app.js';
import { db } from '../../src/infrastructure/database/store.js';
import { seedDatabase } from '../../src/database/seed.js';
import { simulationService, SIMULATION_MODES } from '../../src/infrastructure/external/simulation-service.js';
import { WORKFLOW_STATES } from '../../src/domain/state-machine/states.js';
import { validateStateTransition } from '../../src/domain/state-machine/validator.js';

describe('Workflow Engine Integration Tests', () => {
  beforeAll(async () => {
    await db.init();
    await seedDatabase();
  });

  beforeEach(() => {
    simulationService.setMode(SIMULATION_MODES.NONE, 10);
  });

  describe('Loan Approval Execution Flow', () => {
    it('approves an application when all business rules and external verification pass', async () => {
      const payload = {
        applicantName: 'David Miller',
        age: 32,
        monthlyIncome: 75000,
        requestedAmount: 200000,
        creditScore: 760,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 10000
      };

      const res = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .send(payload)
        .expect(201);

      expect(res.body.executionId).toBeDefined();
      expect(res.body.status).toBe(WORKFLOW_STATES.APPROVED);
      expect(res.body.finalDecision).toBe(WORKFLOW_STATES.APPROVED);

      const expRes = await request(app)
        .get(`/api/executions/${res.body.executionId}/explanation`)
        .expect(200);

      expect(expRes.body.data.summary.failedRulesCount).toBe(0);
      expect(expRes.body.data.summary.passedRulesCount).toBeGreaterThanOrEqual(4);
      expect(expRes.body.data.currentState).toBe(WORKFLOW_STATES.APPROVED);
    });

    it('rejects incomplete payload at intake without creating an execution', async () => {
      const invalidPayload = {
        applicantName: 'D',
        age: 16
      };

      const initialExecutions = await db.listExecutions();

      const res = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .send(invalidPayload)
        .expect(400);

      expect(res.body.error).toContain('Input validation failed');
      expect(res.body.details).toBeInstanceOf(Array);
      expect(res.body.details.length).toBeGreaterThan(0);

      const finalExecutions = await db.listExecutions();
      expect(finalExecutions.length).toBe(initialExecutions.length);
    });

    it('rejects application failing mandatory rules and populates decision explanation', async () => {
      const rejectingPayload = {
        applicantName: 'Robert Vance',
        age: 45,
        monthlyIncome: 15000,
        requestedAmount: 100000,
        creditScore: 550,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 5000
      };

      const res = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .send(rejectingPayload)
        .expect(201);

      expect(res.body.status).toBe(WORKFLOW_STATES.REJECTED);
      expect(res.body.finalDecision).toBe(WORKFLOW_STATES.REJECTED);

      const expRes = await request(app)
        .get(`/api/executions/${res.body.executionId}/explanation`)
        .expect(200);

      const explanation = expRes.body.data;
      expect(explanation.currentState).toBe(WORKFLOW_STATES.REJECTED);
      expect(explanation.summary.failedRulesCount).toBeGreaterThan(0);

      const failedFieldNames = explanation.ruleBreakdown.failed.map(r => r.field);
      expect(failedFieldNames).toContain('monthlyIncome');
    });

    it('routes borderline conditions to manual review and allows reviewer adjudication', async () => {
      const borderlinePayload = {
        applicantName: 'Clara Oswald',
        age: 26,
        monthlyIncome: 40000,
        requestedAmount: 150000,
        creditScore: 650,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 6000
      };

      const res = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .send(borderlinePayload)
        .expect(201);

      expect(res.body.status).toBe(WORKFLOW_STATES.MANUAL_REVIEW);
      const executionId = res.body.executionId;

      const reviewsRes = await request(app)
        .get('/api/reviews')
        .expect(200);

      const pendingItem = reviewsRes.body.data.find(r => r.executionId === executionId);
      expect(pendingItem).toBeDefined();

      const reviewDecisionRes = await request(app)
        .post(`/api/executions/${executionId}/review`)
        .send({
          decision: 'APPROVED',
          reviewerId: 'underwriter-sarah',
          reviewerNotes: 'Verified employment stability and secondary assets.'
        })
        .expect(200);

      expect(reviewDecisionRes.body.data.currentState).toBe(WORKFLOW_STATES.APPROVED);
      expect(reviewDecisionRes.body.data.finalDecision).toBe(WORKFLOW_STATES.APPROVED);
    });
  });

  describe('Idempotency & Concurrent Submissions', () => {
    it('returns the existing execution record on duplicate submissions with identical payload', async () => {
      const idempotencyKey = `IDEMP-DUP-${Date.now()}`;
      const payload = {
        applicantName: 'Fiona Gallagher',
        age: 30,
        monthlyIncome: 55000,
        requestedAmount: 120000,
        creditScore: 740,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 8000
      };

      const res1 = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201);

      expect(res1.body.isReplay).toBe(false);
      const executionId1 = res1.body.executionId;

      const res2 = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(200);

      expect(res2.body.isReplay).toBe(true);
      expect(res2.body.executionId).toBe(executionId1);
    });

    it('rejects with 409 Conflict when an idempotency key is reused with a different payload', async () => {
      const idempotencyKey = `IDEMP-CONFLICT-${Date.now()}`;

      await request(app)
        .post('/api/workflows/loan-approval/execute')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          applicantName: 'George Bailey',
          age: 38,
          monthlyIncome: 60000,
          requestedAmount: 150000,
          creditScore: 730,
          employmentStatus: 'EMPLOYED',
          existingMonthlyDebt: 5000
        })
        .expect(201);

      const conflictRes = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          applicantName: 'George Bailey',
          age: 38,
          monthlyIncome: 99000,
          requestedAmount: 500000,
          creditScore: 730,
          employmentStatus: 'EMPLOYED',
          existingMonthlyDebt: 5000
        })
        .expect(409);

      expect(conflictRes.body.error).toBe('IdempotencyConflictError');
    });

    it('safely handles concurrent submissions with identical idempotency key', async () => {
      const idempotencyKey = `CONCURRENT-${Date.now()}`;
      const payload = {
        applicantName: 'Hannah Montana',
        age: 27,
        monthlyIncome: 80000,
        requestedAmount: 200000,
        creditScore: 750,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 10000
      };

      const promises = [1, 2, 3].map(() =>
        request(app)
          .post('/api/workflows/loan-approval/execute')
          .set('Idempotency-Key', idempotencyKey)
          .send(payload)
      );

      const responses = await Promise.all(promises);
      const executionIds = new Set(responses.map(r => r.body.executionId));

      expect(executionIds.size).toBe(1);
    });
  });

  describe('External Dependencies & Resilience', () => {
    it('retries transient external service failures with backoff and succeeds', async () => {
      simulationService.setMode(SIMULATION_MODES.FAIL_ONCE_THEN_SUCCEED, 10);

      const payload = {
        applicantName: 'Ian Malcolm',
        age: 44,
        monthlyIncome: 90000,
        requestedAmount: 250000,
        creditScore: 780,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 8000
      };

      const res = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .send(payload)
        .expect(201);

      expect(res.body.status).toBe(WORKFLOW_STATES.APPROVED);

      const execDetails = await request(app)
        .get(`/api/executions/${res.body.executionId}`)
        .expect(200);

      const attempts = execDetails.body.data.dependencyAttempts;
      expect(attempts.length).toBe(2);
      expect(attempts[0].status).toBe('TEMPORARY_FAILURE');
      expect(attempts[1].status).toBe('SUCCESS');

      const history = execDetails.body.data.stateHistory;
      const states = history.map(h => h.toState);
      expect(states).toContain(WORKFLOW_STATES.RETRY_PENDING);
    });

    it('terminates execution as FAILED when retry limit is exhausted', async () => {
      simulationService.setMode(SIMULATION_MODES.TIMEOUT, 10);

      const payload = {
        applicantName: 'Julia Roberts',
        age: 39,
        monthlyIncome: 70000,
        requestedAmount: 180000,
        creditScore: 760,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 7000
      };

      const res = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .send(payload)
        .expect(201);

      expect(res.body.status).toBe(WORKFLOW_STATES.FAILED);
      expect(res.body.finalDecision).toBe(WORKFLOW_STATES.FAILED);
      expect(res.body.decisionReason).toContain('failed');

      const execDetails = await request(app)
        .get(`/api/executions/${res.body.executionId}`)
        .expect(200);

      const attempts = execDetails.body.data.dependencyAttempts;
      expect(attempts.length).toBe(3);
      expect(attempts.every(a => a.status === 'TIMEOUT')).toBe(true);
    });

    it('does not trigger infrastructure retries on business rule rejections', async () => {
      const rejectingPayload = {
        applicantName: 'Kevin Flynn',
        age: 22,
        monthlyIncome: 12000,
        requestedAmount: 80000,
        creditScore: 500,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 4000
      };

      const res = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .send(rejectingPayload)
        .expect(201);

      expect(res.body.status).toBe(WORKFLOW_STATES.REJECTED);

      const execDetails = await request(app)
        .get(`/api/executions/${res.body.executionId}`)
        .expect(200);

      expect(execDetails.body.data.dependencyAttempts.length).toBe(0);

      const states = execDetails.body.data.stateHistory.map(h => h.toState);
      expect(states).not.toContain(WORKFLOW_STATES.RETRY_PENDING);
    });
  });

  describe('Configuration Versioning & Immutability', () => {
    it('applies updated rule thresholds to new executions while preserving version on historical records', async () => {
      const payload = {
        applicantName: 'Laura Palmer',
        age: 33,
        monthlyIncome: 28000,
        requestedAmount: 100000,
        creditScore: 740,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 4000
      };

      const v1Res = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .send(payload)
        .expect(201);

      expect(v1Res.body.status).toBe(WORKFLOW_STATES.APPROVED);
      const v1ExecutionId = v1Res.body.executionId;

      await request(app)
        .post('/api/workflows/loan-approval/activate')
        .send({ version: 2 })
        .expect(200);

      const v2Res = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .send(payload)
        .expect(201);

      expect(v2Res.body.status).toBe(WORKFLOW_STATES.REJECTED);

      const oldExec = await request(app)
        .get(`/api/executions/${v1ExecutionId}/explanation`)
        .expect(200);

      expect(oldExec.body.data.versionNumber).toBe(1);
      expect(oldExec.body.data.currentState).toBe(WORKFLOW_STATES.APPROVED);

      await request(app)
        .post('/api/workflows/loan-approval/activate')
        .send({ version: 1 })
        .expect(200);
    });
  });

  describe('State Machine & Audit Consistency', () => {
    it('prevents illegal state transitions', () => {
      expect(() => {
        validateStateTransition(WORKFLOW_STATES.APPROVED, WORKFLOW_STATES.RECEIVED);
      }).toThrow(/Illegal workflow state transition/);

      expect(() => {
        validateStateTransition(WORKFLOW_STATES.RECEIVED, WORKFLOW_STATES.APPROVED);
      }).toThrow(/Illegal workflow state transition/);
    });

    it('persists chronological state transitions and immutable audit logs', async () => {
      const payload = {
        applicantName: 'Michael Corleone',
        age: 35,
        monthlyIncome: 85000,
        requestedAmount: 300000,
        creditScore: 780,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 10000
      };

      const res = await request(app)
        .post('/api/workflows/loan-approval/execute')
        .send(payload)
        .expect(201);

      const historyRes = await request(app)
        .get(`/api/executions/${res.body.executionId}/history`)
        .expect(200);

      const { stateTimeline, auditTrail, ruleEvaluations } = historyRes.body;

      expect(stateTimeline.length).toBeGreaterThanOrEqual(3);
      expect(stateTimeline[0].toState).toBe(WORKFLOW_STATES.RECEIVED);
      expect(stateTimeline[1].toState).toBe(WORKFLOW_STATES.VALIDATED);
      expect(stateTimeline[2].toState).toBe(WORKFLOW_STATES.PROCESSING);

      const eventTypes = auditTrail.map(a => a.eventType);
      expect(eventTypes).toContain('REQUEST_RECEIVED');
      expect(eventTypes).toContain('WORKFLOW_SELECTED');
      expect(eventTypes).toContain('STATE_TRANSITION');
      expect(eventTypes).toContain('RULE_PASSED');
      expect(eventTypes).toContain('FINAL_DECISION');

      expect(ruleEvaluations.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Workflow Extensibility (Insurance Claim)', () => {
    it('executes insurance claim processing on the generic engine without code modification', async () => {
      const claimPayload = {
        policyNumber: 'POL-AUTO-8831',
        claimantName: 'Nancy Wheeler',
        claimAmount: 8500,
        incidentType: 'COLLISION',
        incidentDate: '2026-11-01',
        policeReportFiled: true,
        priorClaimsCount: 1,
        policyAgeMonths: 18
      };

      const res = await request(app)
        .post('/api/workflows/insurance-claim/execute')
        .send(claimPayload)
        .expect(201);

      expect(res.body.status).toBe(WORKFLOW_STATES.APPROVED);
      expect(res.body.finalDecision).toBe(WORKFLOW_STATES.APPROVED);

      const expRes = await request(app)
        .get(`/api/executions/${res.body.executionId}/explanation`)
        .expect(200);

      expect(expRes.body.data.workflowKey).toBe('insurance-claim');
      expect(expRes.body.data.summary.passedRulesCount).toBeGreaterThanOrEqual(3);

      const theftWithoutPolice = {
        policyNumber: 'POL-THEFT-9912',
        claimantName: 'Jonathan Byers',
        claimAmount: 12000,
        incidentType: 'THEFT',
        incidentDate: '2026-11-02',
        policeReportFiled: false,
        priorClaimsCount: 0,
        policyAgeMonths: 12
      };

      const theftRes = await request(app)
        .post('/api/workflows/insurance-claim/execute')
        .send(theftWithoutPolice)
        .expect(201);

      expect(theftRes.body.status).toBe(WORKFLOW_STATES.REJECTED);
    });
  });
});
