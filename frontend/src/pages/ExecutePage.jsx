import React, { useState, useEffect } from 'react';
import { Play, Sparkles, Key, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

const SAMPLE_PAYLOADS = {
  'loan-approval': {
    happy: {
      applicantName: 'Samantha Reed',
      age: 34,
      monthlyIncome: 68000,
      requestedAmount: 220000,
      creditScore: 760,
      employmentStatus: 'EMPLOYED',
      existingMonthlyDebt: 9000
    },
    reject: {
      applicantName: 'Tyler Durden',
      age: 26,
      monthlyIncome: 18000, // < 25000 -> Reject
      requestedAmount: 150000,
      creditScore: 540, // < 600 -> Reject
      employmentStatus: 'EMPLOYED',
      existingMonthlyDebt: 8000
    },
    review: {
      applicantName: 'Jonathan Crane',
      age: 42,
      monthlyIncome: 50000,
      requestedAmount: 180000,
      creditScore: 650, // 600..679 -> Manual Review
      employmentStatus: 'SELF_EMPLOYED',
      existingMonthlyDebt: 8000
    }
  },
  'insurance-claim': {
    happy: {
      policyNumber: 'POL-AUTO-7719',
      claimantName: 'Evelyn Wang',
      claimAmount: 6200,
      incidentType: 'COLLISION',
      incidentDate: '2026-11-05',
      policeReportFiled: true,
      priorClaimsCount: 1,
      policyAgeMonths: 24
    },
    reject: {
      policyNumber: 'POL-THEFT-3321',
      claimantName: 'Victor Creed',
      claimAmount: 25000,
      incidentType: 'THEFT',
      incidentDate: '2026-11-06',
      policeReportFiled: false, // Theft without police report -> Reject
      priorClaimsCount: 1,
      policyAgeMonths: 18
    },
    review: {
      policyNumber: 'POL-AUTO-9988',
      claimantName: 'Natasha Romanoff',
      claimAmount: 75000, // > 50000 -> High value claim manual review
      incidentType: 'COLLISION',
      incidentDate: '2026-11-08',
      policeReportFiled: true,
      priorClaimsCount: 2,
      policyAgeMonths: 36
    }
  }
};

export function ExecutePage({ initialWorkflowKey = 'loan-approval', onViewExecution }) {
  const [workflowKey, setWorkflowKey] = useState(initialWorkflowKey);
  const [jsonText, setJsonText] = useState(
    JSON.stringify(SAMPLE_PAYLOADS['loan-approval'].happy, null, 2)
  );
  const [idempotencyKey, setIdempotencyKey] = useState(`IDEMP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
  const [loading, setLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSelectWorkflow = (key) => {
    setWorkflowKey(key);
    setJsonText(JSON.stringify(SAMPLE_PAYLOADS[key]?.happy || {}, null, 2));
    setExecutionResult(null);
    setError(null);
  };

  const loadPreset = (type) => {
    const payload = SAMPLE_PAYLOADS[workflowKey]?.[type];
    if (payload) {
      setJsonText(JSON.stringify(payload, null, 2));
      setError(null);
    }
  };

  const generateNewIdempotencyKey = () => {
    setIdempotencyKey(`IDEMP-${Math.random().toString(36).substring(2, 9).toUpperCase()}`);
  };

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    setExecutionResult(null);

    let parsedBody;
    try {
      parsedBody = JSON.parse(jsonText);
    } catch (e) {
      setError(`Invalid JSON syntax: ${e.message}`);
      setLoading(false);
      return;
    }

    try {
      const res = await api.executeWorkflow(workflowKey, parsedBody, idempotencyKey);
      setExecutionResult(res);
    } catch (err) {
      setError(err.message || 'Workflow execution failed');
      if (err.details) {
        setError(`Validation Error: ${err.details.map(d => `${d.field}: ${d.message}`).join(', ')}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Execute Business Workflow</h1>
        <p className="text-sm text-slate-400 mt-1">
          Submit JSON business payloads through the intake schema validator and rules engine.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Input Form & Presets */}
        <div className="lg:col-span-2 space-y-4">
          {/* Workflow Selector & Presets */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Active Workflow:
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectWorkflow('loan-approval')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    workflowKey === 'loan-approval'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Loan Approval
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectWorkflow('insurance-claim')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    workflowKey === 'insurance-claim'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Insurance Claim
                </button>
              </div>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/60">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Quick Presets:
              </span>
              <button
                type="button"
                onClick={() => loadPreset('happy')}
                className="px-2.5 py-1 text-xs rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition"
              >
                Happy Path (Approved)
              </button>
              <button
                type="button"
                onClick={() => loadPreset('reject')}
                className="px-2.5 py-1 text-xs rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 transition"
              >
                Failing Rules (Rejected)
              </button>
              <button
                type="button"
                onClick={() => loadPreset('review')}
                className="px-2.5 py-1 text-xs rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition"
              >
                Borderline (Manual Review)
              </button>
            </div>
          </div>

          {/* JSON Payload Editor */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Request Payload (JSON)
              </label>
              <span className="text-[11px] text-slate-400">Strictly validated against schema</span>
            </div>
            <textarea
              rows={12}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full font-mono text-xs p-3.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
          </div>

          {/* Idempotency Key Bar */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Key className="w-4 h-4 text-indigo-400" />
              <div>
                <p className="text-xs font-semibold text-white">Idempotency-Key Header</p>
                <p className="text-[11px] text-slate-400">Guarantees safe duplicate submission protection</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                className="font-mono text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={generateNewIdempotencyKey}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
                title="Generate new UUID key"
              >
                New Key
              </button>
            </div>
          </div>

          {/* Submit Action */}
          <button
            disabled={loading}
            onClick={handleExecute}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Executing Engine Pipeline...' : 'Submit Workflow Request'}
          </button>
        </div>

        {/* Right: Real-time Execution Feedback */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Execution Response</h3>

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                Execution Blocked
              </div>
              <p className="text-xs">{error}</p>
            </div>
          )}

          {executionResult ? (
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
                <span className="text-xs font-semibold text-slate-400">Status</span>
                <StatusBadge status={executionResult.status} size="lg" />
              </div>

              {executionResult.isReplay && (
                <div className="p-2.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs">
                  ℹ️ <strong>Idempotent Replay:</strong> Returned existing execution record for identical key and payload.
                </div>
              )}

              <div>
                <p className="text-xs text-slate-400">Execution Identifier:</p>
                <p className="font-mono text-xs text-indigo-400 font-semibold break-all">{executionResult.executionId}</p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Final Decision:</p>
                <p className="text-sm font-bold text-white mt-0.5">{executionResult.finalDecision || executionResult.status}</p>
              </div>

              {executionResult.decisionReason && (
                <div>
                  <p className="text-xs text-slate-400">Decision Reason:</p>
                  <p className="text-xs text-slate-300 mt-0.5 bg-slate-900/60 p-2.5 rounded border border-slate-800">
                    {executionResult.decisionReason}
                  </p>
                </div>
              )}

              <button
                onClick={() => onViewExecution(executionResult.executionId)}
                className="w-full mt-2 py-2 px-3 text-xs font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center gap-1.5 transition"
              >
                View Full Decision Explanation
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-slate-800/40 border border-slate-700/40 text-center text-xs text-slate-500">
              Submit a request on the left to observe live state transitions, rule evaluations, and idempotency tracking.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

