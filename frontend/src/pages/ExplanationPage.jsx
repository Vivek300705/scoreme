import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  Search,
  RefreshCw,
  FileCheck
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export function ExplanationPage({ initialExecutionId = null }) {
  const [executionId, setExecutionId] = useState(initialExecutionId || '');
  const [recentExecutions, setRecentExecutions] = useState([]);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRecent = async () => {
    try {
      const res = await api.listExecutions({ limit: 10 });
      setRecentExecutions(res.data);
      if (!executionId && res.data.length > 0) {
        setExecutionId(res.data[0].id);
        loadExplanation(res.data[0].id);
      }
    } catch (e) {
      console.error('Failed to load recent executions:', e);
    }
  };

  const loadExplanation = async (id) => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.getExecutionExplanation(id);
      setExplanation(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load explanation');
      setExplanation(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecent();
    if (initialExecutionId) {
      setExecutionId(initialExecutionId);
      loadExplanation(initialExecutionId);
    }
  }, [initialExecutionId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Explainable Decision Intelligence</h1>
        <p className="text-sm text-slate-400 mt-1">
          Root cause analysis, rule threshold deltas, and auditable proof for every business verdict.
        </p>
      </div>

      {/* Search / Select Bar */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Enter Execution ID or select below..."
            value={executionId}
            onChange={(e) => setExecutionId(e.target.value)}
            className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full"
          />
        </div>
        <button
          onClick={() => loadExplanation(executionId)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white rounded-lg transition"
        >
          Generate Explanation
        </button>

        {/* Quick select dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 whitespace-nowrap">Recent:</span>
          <select
            value={executionId}
            onChange={(e) => {
              setExecutionId(e.target.value);
              loadExplanation(e.target.value);
            }}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none max-w-[180px] truncate"
          >
            {recentExecutions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.workflow?.name || e.workflowId} ({e.currentState})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="py-16 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
          Reconstructing explainability trace...
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {explanation && !loading && (
        <div className="space-y-6">
          {/* Main Verdict Banner */}
          <div className={`p-6 rounded-xl border ${
            explanation.finalDecision === 'APPROVED'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : explanation.finalDecision === 'REJECTED'
              ? 'bg-rose-500/10 border-rose-500/30'
              : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {explanation.workflowName} (Policy v{explanation.versionNumber})
                </span>
                <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
                  <span>Decision Verdict:</span>
                  <StatusBadge status={explanation.finalDecision} size="lg" />
                </h2>
                <p className="text-sm text-slate-200 mt-2 font-medium">
                  {explanation.primaryReason}
                </p>
              </div>

              {/* Summary Stats Pill */}
              <div className="flex gap-4 p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="text-center px-2">
                  <p className="text-[10px] text-slate-400 uppercase">Rules Passed</p>
                  <p className="text-lg font-bold text-emerald-400">{explanation.summary.passedRulesCount}</p>
                </div>
                <div className="w-px bg-slate-800" />
                <div className="text-center px-2">
                  <p className="text-[10px] text-slate-400 uppercase">Rules Failed</p>
                  <p className="text-lg font-bold text-rose-400">{explanation.summary.failedRulesCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Failed Rules (Root Causes) */}
          {explanation.ruleBreakdown.failed.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <XCircle className="w-4 h-4" />
                Critical Rule Violations ({explanation.ruleBreakdown.failed.length})
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {explanation.ruleBreakdown.failed.map((rule) => (
                  <div
                    key={rule.ruleId}
                    className="p-4 rounded-xl bg-slate-800/80 border border-rose-500/40 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">{rule.ruleName}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                        Action: {rule.failureAction.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded bg-slate-900/60 text-xs">
                      <div>
                        <span className="text-slate-400">Evaluated Field:</span>
                        <p className="font-mono text-indigo-400 font-semibold">{rule.field}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Required Condition:</span>
                        <p className="font-mono text-white">{rule.operator} {JSON.stringify(rule.expectedValue)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Actual Value Observed:</span>
                        <p className="font-mono text-rose-400 font-bold">{String(rule.actualValue)}</p>
                      </div>
                    </div>

                    <p className="text-xs text-rose-200 mt-1">{rule.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Passed Rules */}
          {explanation.ruleBreakdown.passed.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Satisfied Conditions ({explanation.ruleBreakdown.passed.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {explanation.ruleBreakdown.passed.map((rule) => (
                  <div
                    key={rule.ruleId}
                    className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{rule.ruleName}</span>
                      <span className="text-[10px] font-semibold text-emerald-400">PASSED</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-300 flex items-center justify-between">
                      <span>{rule.field}: <strong className="text-white">{String(rule.actualValue)}</strong></span>
                      <span className="text-slate-500">{rule.operator} {JSON.stringify(rule.expectedValue)}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{rule.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* External Dependencies Verification */}
          {explanation.externalDependencies.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider">
                External Verification Telemetry
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {explanation.externalDependencies.map((ext, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">{ext.dependencyName}</p>
                      <p className="text-[11px] text-slate-400">Attempt #{ext.attemptNumber} • {ext.latencyMs}ms</p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      {ext.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

