# Hackathon Assignment Report: FlowGuard Engine

**Project**: FlowGuard – Configurable Workflow Decision & Resilience Engine  
**Repository**: [https://github.com/Vivek300705/scoreme](https://github.com/Vivek300705/scoreme)  
**Submission Target**: ScoreMe Solutions Pvt. Ltd. (MNNIT Allahabad Assessment)  

---

## 1. Executive Summary

FlowGuard is a production-grade, configurable workflow decision and resilience platform built with **Node.js (ES6+ ES Modules)**, **Express.js**, **Zod**, **Prisma ORM / PostgreSQL**, and a **React 18 + Vite + Tailwind CSS + Recharts** interactive dashboard.

The engine accepts business requests, validates schema structures, evaluates configurable business rules without dynamic code evaluation, orchestrates multi-stage workflows across a strict state machine, records explainable audit trails, and reliably handles infrastructure failures with exponential backoff retries and cryptographic idempotency guarantees.

---

## 2. Core Architecture Highlights

```
                                    +-----------------------------+
                                    |    Client / UI / Webhook    |
                                    +--------------+--------------+
                                                   | HTTP / REST
                                                   v
                                    +-----------------------------+
                                    |     Request Intake (Zod)    |
                                    |  - Schema Validation        |
                                    |  - Idempotency & Hashing    |
                                    +--------------+--------------+
                                                   |
                                                   v
+-------------------------------------------------------------------------------------------------------+
|                                    Workflow Orchestrator Engine                                        |
|                                                                                                       |
|   +---------------------+    +-------------------------+    +------------------+    +-------------+   |
|   | RuleEvaluationStage | -> | ExternalVerification    | -> | ManualReview     | -> | FinalDecision|  |
|   | (Safe Operator Reg) |    | (Chaos / Retry Policy)  |    | (Analyst Queue)  |    | (Consolidate|   |
|   +---------------------+    +-------------------------+    +------------------+    +-------------+   |
+-------------------------------------------------------------------------------------------------------+
                                                   |
                        +--------------------------+--------------------------+
                        |                                                     |
                        v                                                     v
          +----------------------------+                        +----------------------------+
          |      State Machine         |                        |     Audit & Telemetry      |
          |  Strict Transition Matrix  |                        |  Immutable State History   |
          |  RECEIVED -> APPROVED...   |                        |  Explainable Decision Logs |
          +----------------------------+                        +----------------------------+
```

### Key Architectural Pillars
1. **Request Intake & Schema Validation**:
   - Runtime validation with Zod schemas tailored per workflow type.
   - Separation of structural request validation from business rule evaluation.
   - UUIDv4 request ID and correlation ID propagation.

2. **Configuration-Driven Rules Engine**:
   - Zero `eval()` or dynamic JavaScript execution.
   - Safe operator registry supporting 11 deterministic operators: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`, `in`, `not_in`, `between`, `exists`, and `not_exists`.
   - Supports derived fields (e.g. debt-to-income ratio computed dynamically from payload values).
   - Generates human-readable, plain-English explanations for every passed or failed rule.

3. **Stage-Based State Machine & Orchestrator**:
   - Modular stage registry allowing arbitrary stage sequencing without changing core orchestration logic.
   - Strict state transitions: `RECEIVED` -> `VALIDATED` -> `PROCESSING` -> (`APPROVED` | `REJECTED` | `MANUAL_REVIEW` | `RETRY_PENDING` | `FAILED`).
   - Every transition is immutably logged with source state, target state, actor, reason, and timestamp.

4. **Fault Tolerance & Resilience**:
   - Clear architectural distinction between **business rejections** (deterministic; zero retries) and **transient infrastructure failures** (HTTP 408, 429, 503, socket timeouts; retry with exponential backoff and 10% jitter).
   - Configurable retry exhaustion handling: marks execution `FAILED` when `maxRetries` is reached without crashing the process.

5. **Idempotency & Concurrency Guarantees**:
   - SHA-256 payload hashing with recursive key sorting.
   - Exact duplicate requests return original execution without re-execution.
   - Reusing an `Idempotency-Key` with altered payload parameters triggers a strict `409 Conflict`.
   - Concurrent requests with identical keys are deduplicated safely through database uniqueness constraints.

6. **Configuration Versioning**:
   - Active workflow version resolution.
   - New executions run on current version; historical executions retain their original configuration version and explanation integrity.

---

## 3. Workflows Implemented

### Workflow 1: Loan Application Approval (`loan-approval`)
- **Version 1**:
  - Minimum Age: 21 (`gte`)
  - Maximum Age: 65 (`lte`)
  - Minimum Monthly Income: $30,000 (`gte`)
  - Minimum Credit Score: 600 (`gte` -> REJECT threshold)
  - Prime Credit Score Check: 680 (`gte` -> MANUAL_REVIEW threshold)
  - Maximum Debt-to-Income Ratio: 0.45 (`lte`)
  - External Credit Bureau Verification stage
- **Version 2**:
  - Elevated Income Threshold: $35,000 (`gte`)
  - Elevated Credit Score Floor: 640 (`gte`)

### Workflow 2: Insurance Claim Adjudication (`insurance-claim`)
- **Version 1**:
  - Minimum Active Policy Tenure: 30 days (`gte`)
  - Deductible Non-Zero Verification: > 0 (`gt`)
  - Maximum Unsupervised Auto Damage Threshold: $15,000 (`lte` -> MANUAL_REVIEW)
  - Police Report Verification on Theft Claims: `eq true`
  - External Fraud AI Model stage

---

## 4. Automated Test Suite Results

A total of **35 automated tests** (21 unit tests, 14 end-to-end integration tests) were executed using Jest and Supertest, passing with a **100% success rate**:

```
Test Suites: 5 passed, 5 total
Tests:       35 passed, 35 total
Snapshots:   0 total
Time:        7.351 s
Ran all test suites.
```

### Integration Test Matrix (`tests/integration/workflow-engine.test.js`):
| # | Scenario Tested | Domain Covered | Result |
|---|----------------|----------------|:------:|
| 1 | Happy path approval with external verification | Loan Approval | **PASS** |
| 2 | Incomplete payload rejected with 400 validation error | Request Intake | **PASS** |
| 3 | Business rule violation produces deterministic rejection | Business Rules | **PASS** |
| 4 | Borderline risk triggers manual review queue & resolution | Manual Review | **PASS** |
| 5 | Duplicate submission with same idempotency key returns existing | Idempotency | **PASS** |
| 6 | Idempotency key reused with mismatched payload yields 409 Conflict | Idempotency | **PASS** |
| 7 | Concurrent submissions race safely with unique execution | Concurrency | **PASS** |
| 8 | Transient service glitch triggers retry and succeeds on attempt 2 | Resilience | **PASS** |
| 9 | Persistent external outage exhausts max retries to FAILED state | Resilience | **PASS** |
| 10 | Business rule rejection does not trigger external retries | Error Classification | **PASS** |
| 11 | Version 2 activation applies to new runs; old runs retain v1 | Versioning | **PASS** |
| 12 | State machine blocks invalid transitions | State Machine | **PASS** |
| 13 | Audit trail immutably records transitions and rules | Audit Logging | **PASS** |
| 14 | Second distinct domain executes on generic engine | Multi-Workflow | **PASS** |

### Unit Test Suites (`tests/unit/`):
- `operators.test.js`: 7 tests verifying boundary behavior for all 11 operators.
- `rule-evaluator.test.js`: 6 tests for nested fields, derived expressions, and explanations.
- `state-machine.test.js`: 4 tests for transition validation and terminal guards.
- `retry-policy.test.js`: 4 tests for retryable classification and exponential backoff calculations.

---

## 5. Frontend & Observability UI

The user interface is built with **React 18**, **Vite**, **Tailwind CSS**, and **Recharts**, featuring 7 responsive screens:
1. **Telemetry Overview**: Real-time status breakdown, approval ratios, failure rates, and execution time distribution.
2. **Workflows Catalog**: Interactive schema inspector, stage visualizer, and version activator.
3. **Execution Console**: Pre-filled quick test templates (Happy Path, Rule Violation, Manual Review, Chaos Glitch).
4. **Execution Timeline & Audit History**: Step-by-step stage execution visualizer with state transition audits.
5. **Explainability Inspector**: Deep-dive rule evaluation view comparing actual values vs. configured thresholds.
6. **Underwriter Manual Review Queue**: Actionable inbox allowing human reviewers to approve or reject borderline cases with reviewer comments.
7. **Resilience & Chaos Playground**: Interactive fault injector simulating transient timeouts, rate limits, 503 errors, and payload corruption.

---

## 6. Deployment & Quickstart

### Prerequisites
- Node.js >= 18.x
- Docker & Docker Compose (optional for containerized setup)

### Running via Docker Compose
```bash
docker-compose up --build -d
```
- Frontend UI: `http://localhost:5173`
- Backend API: `http://localhost:4000`
- Swagger Documentation: `http://localhost:4000/api-docs`

### Running Locally (Without Docker)
```bash
# Install dependencies
npm install

# Run database seed
npm run seed --workspace=backend

# Run test suite
npm test

# Start backend & frontend concurrently
npm run dev
```

---

## 7. Submission Checklist & Artifacts

- [x] Full source code committed and pushed to GitHub: [https://github.com/Vivek300705/scoreme](https://github.com/Vivek300705/scoreme)
- [x] Zero external unapproved dependencies; standard ES6+ ES Modules.
- [x] Production Dockerfile and `docker-compose.yml` verified.
- [x] Complete documentation:
  - `README.md`
  - `ARCHITECTURE.md` (System design with Mermaid diagrams)
  - `CONFIGURATION_GUIDE.md` (Workflow and rule authoring guide)
  - `DESIGN_DECISIONS.md` (Engineering trade-offs and rationale)
  - `TESTING.md` (Testing guide and test case matrix)
  - `API_EXAMPLES.md` (Full curl request/response catalogue)
- [x] All 35 automated tests passing with 0 failures.
