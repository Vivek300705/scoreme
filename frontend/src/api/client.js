const BASE_URL = '/api';

export async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.details = data.details || null;
    throw error;
  }

  return data;
}

export const api = {
  // System
  getHealth: () => apiRequest('/health'),
  getMetrics: () => apiRequest('/metrics'),

  // Workflows
  listWorkflows: () => apiRequest('/workflows'),
  getWorkflow: (id) => apiRequest(`/workflows/${id}`),
  getWorkflowVersions: (id) => apiRequest(`/workflows/${id}/versions`),
  activateVersion: (id, version) =>
    apiRequest(`/workflows/${id}/activate`, {
      method: 'POST',
      body: JSON.stringify({ version })
    }),

  // Executions
  executeWorkflow: (workflowKey, payload, idempotencyKey = null) => {
    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return apiRequest(`/workflows/${workflowKey}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  },
  listExecutions: (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(`/executions${query ? `?${query}` : ''}`);
  },
  getExecution: (id) => apiRequest(`/executions/${id}`),
  getExecutionHistory: (id) => apiRequest(`/executions/${id}/history`),
  getExecutionExplanation: (id) => apiRequest(`/executions/${id}/explanation`),

  // Reviews
  listPendingReviews: () => apiRequest('/reviews'),
  submitReview: (executionId, decision, reviewerId, reviewerNotes) =>
    apiRequest(`/executions/${executionId}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, reviewerId, reviewerNotes })
    }),

  // Simulation
  getFailureMode: () => apiRequest('/simulation/failure-mode'),
  setFailureMode: (mode, latencyMs) =>
    apiRequest('/simulation/failure-mode', {
      method: 'POST',
      body: JSON.stringify({ mode, latencyMs })
    })
};

