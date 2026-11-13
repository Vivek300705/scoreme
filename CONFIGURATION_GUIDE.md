# FlowGuard Configuration Guide

FlowGuard separates business rules from execution code. Business analysts and system engineers can introduce new workflows or calibrate rule thresholds through declarative JSON configurations without recompiling or redeploying the application.

---

## Workflow Configuration Structure

Every workflow is defined as a JSON document containing:
- **`workflowKey`**: Unique string identifier (e.g. `loan-approval`, `insurance-claim`).
- **`version`**: Integer revision number (e.g. `1`, `2`).
- **`inputSchema`**: JSON Schema describing required fields and data types for request intake.
- **`stages`**: Ordered pipeline array executed sequentially by the engine.

### Example: Loan Application Workflow Configuration

```json
{
  "workflowKey": "loan-approval",
  "name": "Retail Loan Application Approval",
  "version": 1,
  "description": "Standard retail loan approval pipeline with rule evaluation, credit bureau verification, and risk-adjusted decisioning.",
  "status": "ACTIVE",
  "inputSchema": {
    "type": "object",
    "required": [
      "applicantName",
      "age",
      "monthlyIncome",
      "requestedAmount",
      "creditScore",
      "employmentStatus",
      "existingMonthlyDebt"
    ],
    "properties": {
      "applicantName": { "type": "string", "minLength": 2 },
      "age": { "type": "integer", "minimum": 18, "maximum": 100 },
      "monthlyIncome": { "type": "number", "minimum": 0 },
      "requestedAmount": { "type": "number", "minimum": 1000 },
      "creditScore": { "type": "integer", "minimum": 300, "maximum": 850 },
      "employmentStatus": {
        "type": "string",
        "enum": ["EMPLOYED", "SELF_EMPLOYED", "UNEMPLOYED", "RETIRED"]
      },
      "existingMonthlyDebt": { "type": "number", "minimum": 0 }
    }
  },
  "stages": [
    {
      "id": "eligibility-rules",
      "name": "Applicant Eligibility Checks",
      "type": "rule_evaluation",
      "order": 1,
      "combinator": "AND",
      "rules": [
        {
          "id": "rule-min-age",
          "name": "Legal Adult Age Check",
          "field": "age",
          "operator": "gte",
          "value": 18,
          "failureAction": "reject",
          "description": "Applicant must be at least 18 years old"
        },
        {
          "id": "rule-min-income",
          "name": "Minimum Monthly Income",
          "field": "monthlyIncome",
          "operator": "gte",
          "value": 25000,
          "failureAction": "reject",
          "description": "Monthly income must be at least $25,000"
        },
        {
          "id": "rule-credit-score-tier",
          "name": "Prime Credit Score Check",
          "field": "creditScore",
          "operator": "gte",
          "value": 680,
          "failureAction": "manual_review",
          "description": "Credit score between 600 and 679 requires manual underwriter review"
        },
        {
          "id": "rule-debt-to-income",
          "name": "Debt to Income Ratio Check",
          "field": "debtToIncomeRatio",
          "derived": "existingMonthlyDebt / monthlyIncome",
          "operator": "lte",
          "value": 0.45,
          "failureAction": "reject",
          "description": "Debt-to-income ratio must not exceed 45%"
        }
      ]
    },
    {
      "id": "credit-bureau-verification",
      "name": "External Credit Bureau Integration",
      "type": "external_verification",
      "order": 2,
      "dependencyName": "credit-bureau-service",
      "retryPolicy": {
        "maxRetries": 3,
        "initialBackoffMs": 300,
        "backoffMultiplier": 2,
        "retryableStatuses": ["TIMEOUT", "TEMPORARY_FAILURE", "NETWORK_ERROR"]
      }
    },
    {
      "id": "manual-review-stage",
      "name": "Underwriter Review",
      "type": "manual_review",
      "order": 3
    },
    {
      "id": "final-decision-stage",
      "name": "Final Decision Consolidation",
      "type": "final_decision",
      "order": 4
    }
  ]
}
```

---

## Operator Registry Reference

All operators are strictly whitelisted and executed in a sandboxed, deterministic manner:

| Operator | Meaning | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `gt` | Greater than | `18` | `field > value` |
| `gte` | Greater than or equal | `650` | `field >= value` |
| `lt` | Less than | `0.40` | `field < value` |
| `lte` | Less than or equal | `4` | `field <= value` |
| `eq` | Strict equality | `"VERIFIED"` or `true` | `field === value` |
| `neq` | Not equal | `"UNEMPLOYED"` | `field !== value` |
| `in` | Array inclusion | `["EMPLOYED", "RETIRED"]` | `value.includes(field)` |
| `not_in` | Array exclusion | `["BLOCKED", "SANCTIONED"]` | `!value.includes(field)` |
| `exists` | Non-null and defined | `true` | Value is present |
| `not_exists`| Null or undefined | `true` | Value is missing |
| `between` | Inclusive range | `[600, 700]` | `field >= min && field <= max` |

---

## Supported Stage Types

The platform supports an extensible stage registry:

1. **`rule_evaluation`**:
   Evaluates a group of business rules against payload data and computed derived fields. Supports `combinator`: `"AND"` or `"OR"`.
2. **`external_verification`**:
   Communicates with external systems (e.g. Credit Bureau or Fraud AI) with configurable exponential backoff retry policies.
3. **`manual_review`**:
   Routes the execution to an underwriter review queue when borderline or high-risk conditions are triggered.
4. **`final_decision`**:
   Consolidates the aggregate results and transitions the execution to `APPROVED`.

---

## Failure Actions & Precedence

When a rule fails, its configured `failureAction` determines the state transition:
- **`reject`**: Terminal rejection. Execution halts immediately and transitions to `REJECTED`.
- **`manual_review`**: Execution flags underwriter review and routes to `MANUAL_REVIEW`.
- **Precedence**: `reject` strictly overrides `manual_review` when multiple rules evaluate simultaneously.

---

## Versioning Policy & Activation

- Workflow configurations are versioned (`version: 1`, `version: 2`).
- Activating version 2 via `POST /api/workflows/:id/activate` immediately routes all new incoming requests to version 2.
- Historical executions remain permanently pinned to the version under which they originally executed, preserving explainability and audit integrity.

