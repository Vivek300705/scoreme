# FlowGuard

> Configurable Workflow Decision & Resilience Engine

FlowGuard is a workflow decision platform designed for business processes that require deterministic rule evaluation, state orchestration, idempotency guarantees, and end-to-end auditability.

Decision logic, thresholds, and execution stages are separated into declarative configurations. When underwriting policies, claim rules, or compliance standards change, new versions can be introduced and activated without code modifications.

---

## Overview

FlowGuard provides a generic, configuration-driven foundation for multi-stage decision pipelines:

- **Declarative Configuration**: Workflows and rules are defined as versioned JSON structures rather than hardcoded in API controllers.
- **Explainable Decisions**: Every decision outcome includes an audit trace detailing evaluated fields, configured thresholds, observed values, and pass/fail states.
- **Idempotency Protection**: Client-provided `Idempotency-Key` headers paired with recursive SHA-256 payload hashing prevent duplicate processing and catch payload reuse conflicts.
- **Resilient Failure Recovery**: Differentiates between deterministic business rule rejections and transient infrastructure faults; applies jittered exponential backoff for network/service glitches.
- **Append-Only Auditing**: Every state change, rule evaluation, and external call is persisted immutably in relational storage.
- **Management Console**: React dashboard with telemetry metrics, workflow version management, interactive execution sandbox, state timelines, manual review queues, and chaos simulation controls.

---

## Problem & Design Objectives

Automating risk-sensitive workflows (e.g. loan approvals, insurance claim processing) introduces several operational challenges:

1. **Changing Business Rules**: Financial thresholds and risk bands evolve frequently. Hardcoded branching logic requires engineering cycles and redeployments for routine policy changes.
2. **Flaky External Integrations**: Upstream services (credit bureaus, fraud detection APIs) experience network latency, rate limits, and transient downtime. Systems must retry safely without duplicating actions or dropping requests.
3. **Duplicate Request Protection**: Network retries and client resubmissions must be handled deterministically without duplicating business effects.
4. **Auditability & Regulatory Explainability**: When an application is rejected or routed to manual review, systems must provide a traceable record of the exact rules and values that led to the verdict.

FlowGuard addresses these challenges through decoupled domain stages, declarative rule configurations, state machine validation, and append-only audit histories.

---

## Architecture

### High-Level Architecture

```mermaid
flowchart TD
    Client["Client / React Dashboard"] -->|REST / JSON| Gateway["Express.js API Layer"]
    Gateway --> Intake["Request Intake & Schema Validation (Zod)"]
    Intake --> Idemp["Idempotency Manager (SHA-256 Lock)"]
    Idemp --> Orchestrator["Workflow Execution Orchestrator"]

    subgraph Core Domain Engine
        Orchestrator --> StateMachine["State Machine Validator"]
        Orchestrator --> StageReg["Extensible Stage Registry"]
        StageReg --> StageRules["Rule Evaluation Stage"]
        StageReg --> StageExt["External Verification Stage"]
        StageReg --> StageReview["Manual Review Stage"]
        StageReg --> StageFinal["Final Decision Stage"]

        StageRules --> RuleEval["Safe Rule Evaluator"]
        RuleEval --> OpReg["Operator Registry (AST)"]

        StageExt --> RetryEngine["Exponential Backoff Retry Engine"]
        RetryEngine --> ExtSim["Credit Bureau / Fraud AI Simulation"]
    end

    subgraph Persistence Layer
        Orchestrator --> DbStore["Transactional Storage Engine"]
        DbStore --> Prisma["Prisma ORM"]
        Prisma --> Postgres[("PostgreSQL 16")]
        DbStore --> Audit[("State History & Audit Logs")]
    end
```

### Module Responsibilities

| Module | Location | Primary Responsibilities |
| :--- | :--- | :--- |
| **Request Intake** | `src/api/middlewares/request-validator.js` | Validates incoming payloads against workflow JSON schema using Zod; rejects invalid input at HTTP boundary. |
| **Idempotency** | `src/infrastructure/idempotency/` | Computes deterministic SHA-256 hash; acquires atomic database locks; replays existing executions on duplicate submission; rejects payload changes with 409 Conflict. |
| **Rules Engine** | `src/domain/rules/` | Evaluates rule conditions, extracts nested properties, safely evaluates derived ratios without code execution, produces explainable traces. |
| **Operator Registry** | `src/domain/operators/` | Safe, pure functions for mathematical and set comparisons (`gt`, `gte`, `lt`, `lte`, `eq`, `neq`, `in`, `not_in`, `between`, `exists`). |
| **State Machine** | `src/domain/state-machine/` | Enforces deterministic transition matrix; prevents illegal or out-of-order state transitions. |
| **Stage Registry** | `src/domain/stages/` | Decoupled pipeline stages (`rule_evaluation`, `external_verification`, `manual_review`, `final_decision`). |
| **Retry & Resilience** | `src/domain/engine/retry-policy.js` | Classifies errors; calculates exponential backoff with jitter; halts retry on business rejections. |
| **External Simulation**| `src/infrastructure/external/` | Simulates Credit Bureau and Fraud AI services with configurable chaos failure modes. |
| **Storage & Audit** | `src/infrastructure/database/` | Transactional data access, append-only state history, audit logs, and metrics aggregation. |
| **API Layer** | `src/api/` | Express REST controllers, Swagger OpenAPI documentation (`/api/docs`), centralized error handling. |

---

## State Machine & Lifecycle

The execution lifecycle follows an explicit state transition matrix enforced by `validateStateTransition()`:

```
[RECEIVED] -> [VALIDATED] -> [PROCESSING] -> [APPROVED] (Terminal)
                                    |
                                    +-> [REJECTED] (Terminal)
                                    |
                                    +-> [MANUAL_REVIEW] -> [APPROVED] / [REJECTED]
                                    |
                                    +-> [RETRY_PENDING] -> [PROCESSING] -> [FAILED] (Terminal)
```

- **`RECEIVED`**: Request intake accepted and initial record created.
- **`VALIDATED`**: Request structure validated against the workflow's input schema.
- **`PROCESSING`**: Execution stages running in deterministic order.
- **`APPROVED`**: All business rules and external verifications succeeded (terminal).
- **`REJECTED`**: Mandatory business rule failed (terminal).
- **`MANUAL_REVIEW`**: Borderline or risk-threshold condition flagged for underwriter review.
- **`RETRY_PENDING`**: Transient external service fault encountered; waiting for exponential backoff delay before re-attempting.
- **`FAILED`**: Retry attempts exhausted or unrecoverable error encountered (terminal).

---

## Key Capabilities

### Declarative Rules & Safe Evaluation
- Business rules are structured in JSON with explicit operators: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`, `in`, `not_in`, `between`, `exists`, `not_exists`.
- Derived fields (e.g. `existingMonthlyDebt / monthlyIncome`) are computed by a tokenized arithmetic evaluator without invoking `eval()`.
- Rule outcomes specify a `failureAction`: `reject` terminates processing immediately, while `manual_review` routes to an adjudication queue.

### Idempotency & Conflict Detection
- Clients provide an `Idempotency-Key` header with execution requests.
- The payload is normalized and hashed using SHA-256.
- Submissions with an identical key and identical payload return the existing execution result (`isReplay: true`) with HTTP 200.
- Reusing an existing key with a modified payload returns HTTP 409 Conflict.
- Database unique constraints guarantee concurrency safety under simultaneous duplicate submissions.

### Failure Classification & Exponential Backoff
- The retry engine classifies failures into distinct categories:
  - **Business Rejections**: Deterministic policy outcomes; never retried.
  - **Permanent Errors (400 Bad Request)**: Invalid parameters; never retried.
  - **Transient Errors (408, 429, 503, ETIMEDOUT)**: Network or upstream service glitches; retried using exponential backoff with 10% jitter up to `maxRetries`.

### Explainable Decision Intelligence
- Every execution produces a detailed explanation trace (`GET /api/executions/:id/explanation`).
- Explanations list every rule evaluated, the target field, expected threshold, observed value, and whether the condition passed or failed.

---

## Database Schema

FlowGuard uses a normalized PostgreSQL schema managed with Prisma ORM:

- `workflow_definitions`: Workflow key, display name, description, active version reference.
- `workflow_versions`: Pinned configuration snapshots (input schema, stages, rules, metadata).
- `workflow_executions`: Primary execution record with status, decision, input payload, and retry state.
- `workflow_state_history`: Chronological record of state transitions with transition reasons and timestamps.
- `rule_evaluations`: Granular evaluation results for every individual rule check.
- `audit_logs`: Append-only event stream (intake, validation, stage execution, review actions).
- `idempotency_records`: Client idempotency keys, payload hashes, and execution mappings.
- `external_dependency_attempts`: Latency, request/response payloads, and status codes for third-party calls.
- `manual_reviews`: Queue tickets for applications requiring human underwriter approval.

---

## Technology Stack

- **Backend**: Node.js, Express.js (ES Modules)
- **Schema Validation**: Zod
- **Database & ORM**: PostgreSQL 16 Alpine, Prisma ORM (with in-memory transactional fallback for local testing)
- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, Lucide Icons
- **Testing**: Jest, Supertest
- **Containerization**: Docker, Docker Compose

---

## Getting Started

### Prerequisites
- Node.js (v20+ or v24+)
- npm (v10+)

### Local Setup

```bash
# Clone the repository
git clone https://github.com/Vivek300705/scoreme.git
cd scoreme

# Copy environment variables
cp .env.example .env

# Install backend and frontend dependencies
npm install --workspace=backend
npm install --workspace=frontend

# Seed sample workflows and initial data
npm run seed

# Run the test suite
npm test

# Start Backend Server (Port 4000)
npm run dev:backend

# In a separate terminal, start Frontend Dev Server (Port 5173)
npm run dev:frontend
```

Access Points:
- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Interactive Swagger Docs**: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
- **Health Check**: [http://localhost:4000/api/health](http://localhost:4000/api/health)
- **Metrics**: [http://localhost:4000/api/metrics](http://localhost:4000/api/metrics)

---

## Docker Setup

To run the complete platform including PostgreSQL:

```bash
# Build and start services
docker-compose up --build -d

# Check running containers
docker-compose ps

# View backend logs
docker-compose logs -f backend

# Stop services
docker-compose down -v
```

Exposed Services:
- **Frontend Dashboard**: `http://localhost:5173`
- **Backend API**: `http://localhost:4000`
- **PostgreSQL**: `localhost:5432`

---

## Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `4000` | Backend HTTP port |
| `NODE_ENV` | `development` | Node runtime environment |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/flowguard?schema=public` | PostgreSQL connection string |
| `IDEMPOTENCY_EXPIRY_SECONDS` | `86400` | Idempotency key TTL (24h) |
| `DEFAULT_MAX_RETRIES` | `3` | Maximum retry attempts for external calls |
| `DEFAULT_INITIAL_BACKOFF_MS` | `300` | Base exponential backoff delay |
| `SIMULATION_FAILURE_MODE` | `NONE` | Active chaos failure mode |

---

## Testing

```bash
# Run the complete test suite (unit + integration)
npm test

# Run tests with code coverage analysis
npm run test:coverage
```

The test suite covers:
- **Unit Tests**: Operator registry, rule evaluation, state transitions, and retry backoff calculations.
- **Integration Tests**: End-to-end execution, schema validation, business rejections, underwriter reviews, idempotency replays and conflicts, concurrent requests, transient dependency retries, retry exhaustion, configuration versioning, state validation, audit consistency, and multi-workflow execution.

---

## Example Workflows

### 1. Retail Loan Underwriting (`loan-approval`)
- **Stage 1 (Rules)**: Age check (`age >= 18`), minimum income (`monthlyIncome >= 25000`), credit score tiering (`creditScore >= 680` for prime; `600..679` for manual review; `< 600` for reject), debt-to-income ratio (`<= 0.45`).
- **Stage 2 (External)**: Credit Bureau verification with retry handling.
- **Stage 3 (Review)**: Underwriter manual review if flagged.
- **Stage 4 (Decision)**: Final approval consolidation.

### 2. Insurance Claim Adjudication (`insurance-claim`)
- **Stage 1 (Rules)**: Policy tenure check (`policyAgeMonths >= 1`), prior claims limit (`priorClaimsCount <= 4`), theft police report requirement (`incidentType === 'THEFT' => policeReportFiled === true`).
- **Stage 2 (External)**: AI Fraud Risk Assessment.
- **Stage 3 (Review)**: Senior claims adjuster review for claims > $50,000.
- **Stage 4 (Decision)**: Final claim adjudication.

---

## Example API Request

```bash
curl -X POST http://localhost:4000/api/workflows/loan-approval/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: DEMO-LOAN-001" \
  -d '{
    "applicantName": "John Doe",
    "age": 30,
    "monthlyIncome": 70000,
    "requestedAmount": 200000,
    "creditScore": 750,
    "employmentStatus": "EMPLOYED",
    "existingMonthlyDebt": 8000
  }'
```

---

## Production & Scaling Considerations

To scale FlowGuard for high-throughput production:
- **Asynchronous Task Workers**: Extract `RuleEvaluationStage` and `ExternalVerificationStage` into worker pools using BullMQ or Kafka with dead-letter queue support.
- **Configuration Caching**: Cache active workflow versions in Redis with cache invalidation pub/sub upon version activation.
- **Database Partitioning**: Partition `workflow_executions`, `rule_evaluations`, and `audit_logs` by month or workflow type in PostgreSQL.
- **Read Replicas**: Direct dashboard analytical queries to PostgreSQL read replicas using connection pooling (PgBouncer).

---

## Limitations

1. **Synchronous Execution**: The intake endpoint processes stages in-process before returning the HTTP response. For multi-hour or multi-day human approval workflows, an asynchronous queue pattern with webhook callbacks should be adopted.
2. **Single-Region Idempotency**: Idempotency locks are scoped to the database transaction. Multi-region active-active deployments would require a distributed consensus layer.
