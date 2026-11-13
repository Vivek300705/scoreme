export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'FlowGuard – Configurable Workflow Decision & Resilience Engine API',
    version: '1.0.0',
    description: 'REST API for workflow execution, rule evaluation, state orchestration, and decision explainability.'
  },
  servers: [
    {
      url: '/api',
      description: 'FlowGuard Local API Base'
    }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'System health check',
        responses: {
          200: { description: 'Engine operational status and database connectivity' }
        }
      }
    },
    '/metrics': {
      get: {
        summary: 'Aggregated workflow execution metrics and success rates',
        responses: {
          200: { description: 'Current metrics payload' }
        }
      }
    },
    '/workflows': {
      get: {
        summary: 'List all workflow definitions and active versions',
        responses: {
          200: { description: 'Array of workflow definitions' }
        }
      },
      post: {
        summary: 'Register a new workflow or workflow version',
        responses: {
          201: { description: 'Created workflow definition' }
        }
      }
    },
    '/workflows/{id}': {
      get: {
        summary: 'Retrieve workflow definition by key or ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Workflow definition with versions' },
          404: { description: 'Workflow not found' }
        }
      }
    },
    '/workflows/{id}/execute': {
      post: {
        summary: 'Execute a workflow with business payload and idempotency key',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
          { name: 'X-Correlation-ID', in: 'header', required: false, schema: { type: 'string' } }
        ],
        responses: {
          201: { description: 'Workflow execution successfully completed' },
          200: { description: 'Idempotent replay returned for identical key' },
          400: { description: 'Input validation failure' },
          409: { description: 'Idempotency key reuse conflict' }
        }
      }
    },
    '/executions': {
      get: {
        summary: 'List historical workflow executions with optional filters',
        responses: {
          200: { description: 'List of executions' }
        }
      }
    },
    '/executions/{id}': {
      get: {
        summary: 'Get execution details including stages and rules',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Execution details' },
          404: { description: 'Execution not found' }
        }
      }
    },
    '/executions/{id}/explanation': {
      get: {
        summary: 'Get structured explainability record for decision outcome',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Detailed decision explanation and rule evaluations' }
        }
      }
    },
    '/reviews': {
      get: {
        summary: 'List pending manual reviews',
        responses: {
          200: { description: 'Array of pending manual review items' }
        }
      }
    },
    '/executions/{id}/review': {
      post: {
        summary: 'Submit underwriter decision for pending manual review',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['decision'],
                properties: {
                  decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
                  reviewerId: { type: 'string' },
                  reviewerNotes: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Review resolved and execution transitioned' }
        }
      }
    },
    '/simulation/failure-mode': {
      get: {
        summary: 'Get active chaos / dependency failure mode',
        responses: {
          200: { description: 'Active simulation settings' }
        }
      },
      post: {
        summary: 'Set dependency failure simulation mode (e.g. TIMEOUT, SERVICE_UNAVAILABLE, FAIL_ONCE_THEN_SUCCEED)',
        responses: {
          200: { description: 'Simulation settings updated' }
        }
      }
    }
  }
};

