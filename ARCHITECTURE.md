# FlowGuard Architecture Specification

FlowGuard is a workflow decision and state orchestration engine designed for business processes that require deterministic rule evaluation, idempotency guarantees, fault tolerance, and comprehensive auditability.

---

## High-Level Architecture

```mermaid
flowchart TD
    Client["Client / React Dashboard"] -->|REST / JSON| Gateway["Express.js API Layer"]
    Gateway --> Intake["Request Intake & Schema Validation (Zod)"]
    Intake --> Idemp["Idempotency Manager (SHA-256 Lock)"]
    Idemp --> Orchestrator["Workflow Execution Orchestrator"]

    subgraph Domain Engine ["FlowGuard Core Domain"]
        Orchestrator --> StateMach["Lifecycle State Machine"]
        Orchestrator --> StageReg["Stage Registry"]
        
        StageReg --> StageRules["Rule Evaluation Stage"]
        StageReg --> StageExt["External Verification Stage"]
        StageReg --> StageReview["Manual Review Stage"]
        StageReg --> StageFinal["Final Decision Stage"]

        StageRules --> RuleEval["Safe Rule Evaluator"]
        RuleEval --> OpReg["Explicit Operator Registry (Safe AST)"]

        StageExt --> RetryPol["Exponential Backoff Retry Engine"]
        RetryPol --> ExtSim["External Service Simulation (Credit/Fraud)"]
    end

    subgraph Persistence Layer ["Storage & Audit Layer"]
        Orchestrator --> DbStore["Transactional Storage Engine"]
        DbStore --> Prisma["Prisma ORM"]
        Prisma --> Postgres[("PostgreSQL 16")]
        DbStore --> AuditHistory[("Append-Only State History & Audit Logs")]
    end
```

---

## Request Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / API Caller
    participant Intake as Request Intake (Zod)
    participant Idemp as Idempotency Engine
    participant Orch as Workflow Orchestrator
    participant State as State Machine
    participant Rules as Rule Engine
    participant Ext as External Service
    participant Audit as DB & Audit Trail

    Client->>Intake: POST /api/workflows/:id/execute (Idempotency-Key)
    Intake->>Intake: Validate payload against Workflow Schema
    alt Validation Failure
        Intake-->>Client: 400 Bad Request (Validation Issues)
    end

    Intake->>Idemp: Check & Acquire Idempotency Lock
    alt Idempotency Key Exists (Same Payload)
        Idemp-->>Client: 200 OK (Cached / Replayed Execution)
    else Idempotency Key Exists (Different Payload)
        Idemp-->>Client: 409 Conflict (Payload mismatch)
    end

    Intake->>Orch: Begin Execution
    Orch->>State: Transition (RECEIVED -> VALIDATED -> PROCESSING)
    Orch->>Audit: Append State History & Audit Event

    Orch->>Rules: Execute Rule Evaluation Stage
    Rules->>Rules: Evaluate rules in deterministic order
    Rules->>Audit: Save Rule Evaluations & Explanations

    alt Mandatory Rule Fails (failureAction = 'reject')
        Rules-->>Orch: Action: REJECT
        Orch->>State: Transition (PROCESSING -> REJECTED)
        Orch->>Audit: Final Decision: REJECTED
        Orch-->>Client: 201 Created (REJECTED + Explainable Reason)
    else Borderline Rule Fails (failureAction = 'manual_review')
        Rules-->>Orch: Action: MANUAL_REVIEW
        Orch->>State: Transition (PROCESSING -> MANUAL_REVIEW)
        Orch->>Audit: Create Manual Review Ticket
        Orch-->>Client: 201 Created (MANUAL_REVIEW)
    else All Mandatory Rules Pass
        Orch->>Ext: Invoke External Verification Stage
        alt Network Failure / Timeout
            Ext->>Ext: Check retry eligibility (Exponential backoff)
            Ext->>State: Transition (PROCESSING -> RETRY_PENDING)
            Ext->>Ext: Wait backoff (initial * 2^attempt + jitter)
            Ext->>State: Transition (RETRY_PENDING -> PROCESSING)
            Ext->>Ext: Retry service invocation
        end
        Ext->>Audit: Record Dependency Attempt & Latency
        Ext-->>Orch: Verification Success
        Orch->>State: Transition (PROCESSING -> APPROVED)
        Orch->>Audit: Final Decision: APPROVED
        Orch-->>Client: 201 Created (APPROVED)
    end
```

---

## Workflow State Machine Lifecycle

```mermaid
stateDiagram-v2
    [*] --> RECEIVED: Request Accepted
    RECEIVED --> VALIDATED: Schema Checked
    RECEIVED --> FAILED: Intake Aborted

    VALIDATED --> PROCESSING: Stage Execution Starts
    VALIDATED --> FAILED: Context Error

    PROCESSING --> APPROVED: All Checks & Verifications Pass
    PROCESSING --> REJECTED: Mandatory Rule Violation
    PROCESSING --> MANUAL_REVIEW: Borderline Risk Triggered
    PROCESSING --> RETRY_PENDING: Retryable Network / Timeout Glitch
    PROCESSING --> FAILED: Retries Exhausted / Fatal Error

    RETRY_PENDING --> PROCESSING: Backoff Elapsed (Next Attempt)
    RETRY_PENDING --> FAILED: Backoff Aborted

    MANUAL_REVIEW --> APPROVED: Underwriter Approves
    MANUAL_REVIEW --> REJECTED: Underwriter Rejects

    APPROVED --> [*]: Terminal State
    REJECTED --> [*]: Terminal State
    FAILED --> [*]: Terminal State
```

---

## Resilience & Retry Flow

```mermaid
flowchart TD
    Invoke["Invoke External Dependency"] --> Attempt["Record Attempt in DB"]
    Attempt --> Call["Call External Service"]
    
    Call -->|Success| Merge["Merge Result into Workflow Context"]
    Merge --> NextStage["Advance to Next Pipeline Stage"]

    Call -->|Failure / Error| Classify["Classify Error Type"]
    Classify -->|Business Rejection| NoRetry["Do NOT Retry! Mark Rejected"]
    Classify -->|Permanent 400| NoRetryPerm["Do NOT Retry! Mark Failed"]

    Classify -->|Retryable 408/429/503/ETIMEDOUT| CheckCount{"Attempts < Max Retries?"}
    CheckCount -->|No (Exhausted)| Exhausted["Mark Execution FAILED (Max Attempts Reached)"]
    CheckCount -->|Yes| CalcDelay["Calculate Exponential Backoff: delay = initial * (multiplier^attempt) + jitter"]
    
    CalcDelay --> StateRetry["Transition State to RETRY_PENDING"]
    StateRetry --> Sleep["Wait Backoff Duration"]
    Sleep --> StateProc["Transition State to PROCESSING"]
    StateProc --> Call
```

---

## Database Entity Relationships (ERD)

```mermaid
erDiagram
    workflow_definitions ||--o{ workflow_versions : "has versions"
    workflow_definitions ||--o{ workflow_executions : "executed by"
    workflow_versions ||--o{ workflow_executions : "pinned to version"
    
    workflow_executions ||--o{ workflow_state_history : "records transitions"
    workflow_executions ||--o{ rule_evaluations : "records rules"
    workflow_executions ||--o{ audit_logs : "records audit trail"
    workflow_executions ||--o{ external_dependency_attempts : "records attempts"
    workflow_executions ||--o| manual_reviews : "reviews"
    workflow_executions ||--o| idempotency_records : "protected by"

    workflow_definitions {
        string id PK
        string workflow_key UK
        string name
        string description
        string active_version_id
        timestamp created_at
        timestamp updated_at
    }

    workflow_versions {
        string id PK
        string workflow_id FK
        int version
        string status
        jsonb input_schema
        jsonb stages
        jsonb metadata
        timestamp created_at
    }

    workflow_executions {
        string id PK
        string workflow_id FK
        string workflow_version_id FK
        string idempotency_key UK
        string current_state
        jsonb input_data
        jsonb context_data
        string final_decision
        string decision_reason
        int retry_count
        int max_retries
        timestamp next_retry_at
        string correlation_id
        timestamp created_at
        timestamp updated_at
    }

    workflow_state_history {
        string id PK
        string execution_id FK
        string from_state
        string to_state
        string transition_reason
        jsonb metadata
        timestamp created_at
    }

    rule_evaluations {
        string id PK
        string execution_id FK
        string stage_id
        string rule_id
        string rule_name
        string field
        string operator
        jsonb expected_value
        jsonb actual_value
        boolean passed
        string failure_action
        string explanation
        timestamp evaluated_at
    }

    audit_logs {
        string id PK
        string execution_id FK
        string correlation_id
        string event_type
        string previous_state
        string new_state
        jsonb details
        string stage_id
        string rule_id
        timestamp created_at
    }

    idempotency_records {
        string id PK
        string idempotency_key UK
        string request_hash
        string workflow_key
        string execution_id FK
        string status
        int response_code
        jsonb response_body
        timestamp expires_at
        timestamp created_at
    }

    external_dependency_attempts {
        string id PK
        string execution_id FK
        string dependency_name
        int attempt_number
        string status
        string error_message
        jsonb request_payload
        jsonb response_payload
        int latency_ms
        timestamp created_at
    }

    manual_reviews {
        string id PK
        string execution_id FK
        string status
        string reviewer_id
        string reviewer_notes
        timestamp assigned_at
        timestamp decided_at
    }
```

---

## Architectural Justifications & Trade-offs

### Modular Monolith vs. Distributed Microservices
- **Choice**: Modular Monolith with strictly separated domain, application, and infrastructure layers.
- **Justification**: Eliminates distributed transaction failures, dual-write anomalies, and network hop latency during early lifecycle iterations. Boundaries are cleanly decoupled so `RuleEvaluationStage` or `ExternalVerificationStage` can be extracted into independent worker containers if horizontal scale warrants.

### PostgreSQL with Prisma ORM
- **Choice**: PostgreSQL 16 with Prisma ORM.
- **Justification**: ACID compliance is mandatory for financial decisions. PostgreSQL provides atomic transactions, unique constraints on idempotency keys, and indexed JSONB columns for flexible configuration schemas without sacrificing relational integrity.

### Safe Operator Registry vs. Dynamic JavaScript Evaluation
- **Choice**: Closed operator registry (`gt`, `gte`, `lt`, `lte`, `eq`, `neq`, `in`, `not_in`, `between`, `exists`).
- **Justification**: Executing code submitted in workflow configurations (`eval` or `Function`) is a severe security vulnerability (Remote Code Execution). The explicit operator registry guarantees mathematical determinism, total isolation, and 100% human-explainable traces.

### Idempotency vs. Duplicate Detection
- **Idempotency**: Guarantees that repeating the request with the identical `Idempotency-Key` and identical payload produces the exact same outcome without re-executing side effects or duplicating database records.
- **Conflict Protection**: Reusing the same key with a modified payload is identified as a dangerous ambiguity and rejected immediately with `409 Conflict`.

