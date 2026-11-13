# FlowGuard API Examples & Sample Requests

This document provides sample cURL requests and expected JSON responses for primary FlowGuard workflows.

---

## System Health Check

```bash
curl -X GET http://localhost:4000/api/health
```

**Response (HTTP 200 OK):**
```json
{
  "status": "HEALTHY",
  "service": "flowguard-decision-engine",
  "timestamp": "2026-11-13T07:40:00.000Z",
  "uptimeSeconds": 142,
  "database": "Transactional Storage Engine (Active)"
}
```

---

## Execute Loan Application – Happy Path (Approved)

```bash
curl -X POST http://localhost:4000/api/workflows/loan-approval/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: DEMO-HAPPY-001" \
  -d '{
    "applicantName": "Sarah Connor",
    "age": 32,
    "monthlyIncome": 75000,
    "requestedAmount": 200000,
    "creditScore": 760,
    "employmentStatus": "EMPLOYED",
    "existingMonthlyDebt": 8000
  }'
```

**Response (HTTP 201 Created):**
```json
{
  "executionId": "b18274a2-8921-4f33-8a0a-0991a27e852a",
  "workflowKey": "loan-approval",
  "status": "APPROVED",
  "finalDecision": "APPROVED",
  "decisionReason": "All policy eligibility checks and external verifications succeeded.",
  "isReplay": false,
  "correlationId": "corr-1794555800100",
  "createdAt": "2026-11-13T07:41:00.000Z"
}
```

---

## Execute Loan Application – Business Rejection

```bash
curl -X POST http://localhost:4000/api/workflows/loan-approval/execute \
  -H "Content-Type: application/json" \
  -d '{
    "applicantName": "Kyle Reese",
    "age": 28,
    "monthlyIncome": 15000,
    "requestedAmount": 100000,
    "creditScore": 540,
    "employmentStatus": "EMPLOYED",
    "existingMonthlyDebt": 5000
  }'
```

**Response (HTTP 201 Created):**
```json
{
  "executionId": "c39481b3-7721-4d11-9a1b-1882b38f961b",
  "workflowKey": "loan-approval",
  "status": "REJECTED",
  "finalDecision": "REJECTED",
  "decisionReason": "Rule \"Minimum Monthly Income\" FAILED: monthlyIncome was 15000, but expected gte 25000. Triggered REJECT. | Rule \"Minimum Credit Score Threshold\" FAILED: creditScore was 540, but expected gte 600. Triggered REJECT.",
  "isReplay": false
}
```

---

## Query Decision Explanation Endpoint

```bash
curl -X GET http://localhost:4000/api/executions/c39481b3-7721-4d11-9a1b-1882b38f961b/explanation
```

**Response (HTTP 200 OK):**
```json
{
  "data": {
    "executionId": "c39481b3-7721-4d11-9a1b-1882b38f961b",
    "workflowKey": "loan-approval",
    "workflowName": "Retail Loan Application Approval",
    "versionNumber": 1,
    "currentState": "REJECTED",
    "finalDecision": "REJECTED",
    "summary": {
      "totalRulesEvaluated": 6,
      "passedRulesCount": 4,
      "failedRulesCount": 2,
      "externalDependencyAttemptsCount": 0,
      "stateTransitionsCount": 3
    },
    "ruleBreakdown": {
      "failed": [
        {
          "ruleId": "rule-min-income",
          "ruleName": "Minimum Monthly Income",
          "field": "monthlyIncome",
          "operator": "gte",
          "expectedValue": 25000,
          "actualValue": 15000,
          "failureAction": "reject",
          "explanation": "Rule \"Minimum Monthly Income\" FAILED: monthlyIncome was 15000, but expected gte 25000. Triggered REJECT."
        }
      ]
    }
  }
}
```

---

## Duplicate Submission (Idempotent Replay)

Submitting with the identical `Idempotency-Key` and identical payload:

```bash
curl -X POST http://localhost:4000/api/workflows/loan-approval/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: DEMO-HAPPY-001" \
  -d '{
    "applicantName": "Sarah Connor",
    "age": 32,
    "monthlyIncome": 75000,
    "requestedAmount": 200000,
    "creditScore": 760,
    "employmentStatus": "EMPLOYED",
    "existingMonthlyDebt": 8000
  }'
```

**Response (HTTP 200 OK):**
```json
{
  "executionId": "b18274a2-8921-4f33-8a0a-0991a27e852a",
  "status": "APPROVED",
  "isReplay": true
}
```

---

## Idempotency Key Conflict (Payload Mismatch)

Reusing the same key with an altered payload:

```bash
curl -X POST http://localhost:4000/api/workflows/loan-approval/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: DEMO-HAPPY-001" \
  -d '{
    "applicantName": "Sarah Connor",
    "age": 32,
    "monthlyIncome": 999999,
    "requestedAmount": 999999,
    "creditScore": 760,
    "employmentStatus": "EMPLOYED",
    "existingMonthlyDebt": 8000
  }'
```

**Response (HTTP 409 Conflict):**
```json
{
  "error": "IdempotencyConflictError",
  "message": "Idempotency key reuse with differing request payload detected",
  "statusCode": 409
}
```

---

## Manual Review Routing & Adjudication

### Step 1: Submit borderline applicant
```bash
curl -X POST http://localhost:4000/api/workflows/loan-approval/execute \
  -H "Content-Type: application/json" \
  -d '{
    "applicantName": "Peter Parker",
    "age": 24,
    "monthlyIncome": 45000,
    "requestedAmount": 120000,
    "creditScore": 650,
    "employmentStatus": "EMPLOYED",
    "existingMonthlyDebt": 6000
  }'
```
**Response (HTTP 201 Created):** `status: "MANUAL_REVIEW"`

### Step 2: Underwriter submits review decision
```bash
curl -X POST http://localhost:4000/api/executions/<EXECUTION_ID>/review \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "APPROVED",
    "reviewerId": "senior-underwriter-alice",
    "reviewerNotes": "Approved based on high liquid asset reserves."
  }'
```

**Response (HTTP 200 OK):**
```json
{
  "message": "Execution <EXECUTION_ID> successfully resolved with decision APPROVED",
  "data": {
    "currentState": "APPROVED",
    "finalDecision": "APPROVED"
  }
}
```

---

## Insurance Claim Processing Workflow

```bash
curl -X POST http://localhost:4000/api/workflows/insurance-claim/execute \
  -H "Content-Type: application/json" \
  -d '{
    "policyNumber": "POL-99128-AUTO",
    "claimantName": "Diana Prince",
    "claimAmount": 7800,
    "incidentType": "COLLISION",
    "incidentDate": "2026-11-01",
    "policeReportFiled": true,
    "priorClaimsCount": 0,
    "policyAgeMonths": 24
  }'
```

**Response (HTTP 201 Created):**
```json
{
  "executionId": "f7192a01-8841-4c11-9a22-37190d7e8a91",
  "workflowKey": "insurance-claim",
  "status": "APPROVED",
  "finalDecision": "APPROVED"
}
```

---

## Failure Simulation & Chaos Mode Configuration

```bash
curl -X POST http://localhost:4000/api/simulation/failure-mode \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "FAIL_ONCE_THEN_SUCCEED",
    "latencyMs": 100
  }'
```

**Response (HTTP 200 OK):**
```json
{
  "message": "Simulation mode updated to FAIL_ONCE_THEN_SUCCEED",
  "data": {
    "currentMode": "FAIL_ONCE_THEN_SUCCEED",
    "latencyMs": 100
  }
}
```

