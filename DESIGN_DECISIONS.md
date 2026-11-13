# FlowGuard Architecture & Design Decisions

This document details the architectural decisions, design patterns, and engineering trade-offs adopted in FlowGuard.

---

## Modular Monolith vs. Microservices Architecture

### Decision
A modular monolith architecture with strictly separated domains was chosen over distributed microservices.

### Context
Distributed microservices introduce significant operational complexity: network latency, distributed transactions, partial failure modes, and complex observability requirements.

### Rationale
- FlowGuard prioritizes consistency, deterministic rule evaluation, and complete auditability.
- All module boundaries (`Intake`, `RulesEngine`, `StateMachine`, `StageRegistry`, `IdempotencyManager`, `DbStore`) are isolated with explicit interfaces and zero cyclic dependencies.
- This design provides the transactional guarantees and zero-network-hop latency of a unified process, while keeping stage implementations decoupled so individual components (e.g., worker pools) can be extracted into standalone services if throughput demands scale.

---

## Safe Rule Evaluation vs. Dynamic Code Execution (`eval`)

### Decision
Dynamic code execution through `eval()` or `new Function()` is avoided. All rule evaluations execute through an explicit, closed operator registry.

### Context
Allowing arbitrary JavaScript expressions in JSON workflow configurations is a common antipattern that creates severe security risks (Remote Code Execution) and non-deterministic execution paths.

### Rationale
- The operator registry supports pure, deterministic functions (`gt`, `gte`, `lt`, `lte`, `eq`, `neq`, `in`, `not_in`, `between`, `exists`, `not_exists`).
- Derived field calculation is handled by a tokenized arithmetic evaluator (`computeDerivedField`) that safely resolves numeric ratios (e.g. `existingMonthlyDebt / monthlyIncome`).
- The evaluation trace records exact operator names, expected thresholds, and actual observed values, providing full explainability for compliance and audits.

---

## Storage Layer Architecture & Resilience

### Decision
PostgreSQL with Prisma ORM is the primary relational database, accompanied by a transactional in-memory storage fallback.

### Context
Local developer workstations and test suites benefit from running tests rapidly without mandatory external container dependencies, while production requires strict relational integrity.

### Rationale
- **Production (`docker-compose up`)**: PostgreSQL 16 Alpine provides ACID compliance, foreign key cascades, unique constraints, and JSONB indexing for workflow definitions.
- **Development & Testing**: The database repository includes an in-memory transactional store enforcing identical constraints (idempotency key uniqueness, state transition validation, and append-only audit histories).
- Both modes share an identical repository contract, ensuring test reproducibility in any environment.

---

## Idempotency Strategy & Concurrency Safety

### Decision
Deterministic SHA-256 request payload hashing paired with atomic database uniqueness locks.

### Mechanism
1. The client supplies an `Idempotency-Key` header with each workflow execution request.
2. The payload is normalized by recursively sorting object keys to generate a deterministic SHA-256 hash.
3. An `idempotency_records` record is reserved in `PENDING` state.
4. **Duplicate Submission (Same Hash)**: Returns the original execution result with HTTP 200 without re-running any rules or external calls.
5. **Key Conflict (Different Hash)**: If an existing key is presented with a modified payload, the request is rejected immediately with HTTP 409 Conflict.
6. **Concurrent Duplicate Requests**: Database unique constraints ensure that simultaneous requests with the same key race safely; exactly one creates the record and all others receive the canonical execution reference.

---

## Separation of Business Rejections from Infrastructure Failures

### Decision
Strictly distinguish between deterministic business rejections and transient infrastructure faults.

### Rationale
- **Business Rejections** (e.g. Applicant monthly income below threshold or credit score below minimum) are deterministic policy outcomes. Retrying them is wasteful and will never change the verdict. Business rejections never trigger retries.
- **Temporary Infrastructure Failures** (e.g. Credit Bureau timeout `ETIMEDOUT`, HTTP 503 `SERVICE_UNAVAILABLE`, HTTP 429 `RATE_LIMIT`) represent transient environmental glitches. The engine applies exponential backoff with jitter (`delay = initial * multiplier^attempt + jitter`), transitions state to `RETRY_PENDING`, and retries up to `maxRetries`.
- **Permanent Infrastructure Failures** (e.g. HTTP 400 Bad Request) terminate immediately without retry.

---

## Immutable Append-Only Audit Logging

### Decision
Execution state history, rule evaluations, and audit logs are strictly append-only.

### Rationale
- Risk management and regulatory compliance require that historical decision data cannot be mutated or overwritten.
- State changes write a new row to `workflow_state_history`.
- Rule outcomes, external dependency latencies, and underwriter notes write new rows to `audit_logs` and `rule_evaluations`.
- The decision explanation endpoint can reconstruct why a decision was reached at any point in the lifecycle.
