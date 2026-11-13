# FlowGuard Testing Guide & Verification

FlowGuard includes an automated test suite implemented with Jest and Supertest, containing 35 tests covering all core workflow engine capabilities, resilience behaviors, and state machine integrity.

---

## Running the Automated Tests

To run the complete test suite:

```bash
# From the root directory:
npm run test

# Or from the backend directory:
cd backend
npm test
```

To run with coverage reporting:

```bash
npm run test:coverage
```

---

## Integration Test Suite (`tests/integration/workflow-engine.test.js`)

The integration test suite validates end-to-end workflow execution, failure recovery, idempotency guarantees, and state consistency:

| Domain Area | Scenario Tested | Expected Behavior | Result |
| :--- | :--- | :--- | :--- |
| **Loan Approval** | Happy path execution | Application meeting criteria passes rules and credit bureau check, reaching `APPROVED`. | **PASS** |
| **Request Intake** | Missing mandatory fields | Incomplete payload rejected at intake by Zod schema before any business execution is initialized. | **PASS** |
| **Business Rules** | Mandatory rule violation | Application failing income or credit threshold reaches `REJECTED`; explanation identifies failed rule. | **PASS** |
| **Manual Review** | Borderline risk condition | Score of 650 triggers `MANUAL_REVIEW`. Ticket appears in review queue; underwriter resolves state to `APPROVED`. | **PASS** |
| **Idempotency** | Duplicate submission | Submitting identical `Idempotency-Key` and payload returns existing execution without re-executing stages. | **PASS** |
| **Idempotency** | Key payload conflict | Reusing an existing `Idempotency-Key` with a modified payload returns `409 Conflict`. | **PASS** |
| **Concurrency** | Concurrent duplicate requests | Multiple simultaneous requests sent with the identical key race safely via database uniqueness constraints; exactly one execution is created. | **PASS** |
| **Resilience** | Transient dependency glitch | Transient service failure triggers exponential backoff retry. State transitions to `RETRY_PENDING` and succeeds on attempt 2. | **PASS** |
| **Resilience** | Retry exhaustion | Persistent external service failure exceeds `maxRetries: 3` and terminates execution in `FAILED` state. | **PASS** |
| **Resilience** | Business rejection vs retry | Business rule failure terminates immediately without calling external services or scheduling retries. | **PASS** |
| **Versioning** | Configuration change | Activating Version 2 with higher thresholds applies to new executions while historical Version 1 executions retain their original version and explanation. | **PASS** |
| **State Machine** | Transition validation | Attempting an illegal transition (e.g. jumping from `RECEIVED` to `APPROVED` or transitioning out of terminal `APPROVED`) is rejected. | **PASS** |
| **Audit Trail** | Consistent event persistence | Every state transition, rule evaluation, and external call is immutably appended to `workflow_state_history` and `audit_logs`. | **PASS** |
| **Multi-Workflow** | Insurance claim adjudication | Adjudicates auto and property insurance claims (policy tenure, theft police report, AI fraud model) on the generic engine without modifying core code. | **PASS** |

---

## Unit Test Suite (`tests/unit/`)

In addition to end-to-end integration tests, 21 unit tests verify core domain components:
- `backend/tests/unit/operators.test.js`: All 11 operators, type casting, array inclusion, boundary conditions, and unknown operator rejection.
- `backend/tests/unit/rule-evaluator.test.js`: Derived expressions (`computeDerivedField`), nested property resolution, AND/OR logic, and explainable sentence generation.
- `backend/tests/unit/state-machine.test.js`: Deterministic transition matrix, terminal state detection, and illegal transition guards.
- `backend/tests/unit/retry-policy.test.js`: Error classification, exponential backoff with jitter calculation, and retry attempt exhaustion.

---

## Test Execution Summary

```
Test Suites: 5 passed, 5 total
Tests:       35 passed, 35 total
Snapshots:   0 total
Time:        7.499 s
Ran all test suites.
```
