import React, { useState, useEffect } from 'react';
import {
  Clock,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileText
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export function ExecutionDetailsPage({ executionId, onBack, onExplain }) {
  const [execution, setExecution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('rules'); // rules, timeline, dependency, input

  const fetchExecution = async () => {
    if (!executionId) return;
    try {
      setLoading(true);
      const res = await api.getExecution(executionId);
      setExecution(res.data);
    } catch (err) {
      console.error('Failed to load execution details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecution();
  }, [executionId]);

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
        Loading execution audit trail...
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="p-8 text-center text-slate-400">
        Execution not found or ID missing.{' '}
        <button onClick={onBack} className="text-indigo-400 underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button onClick={onBack} className="text-xs text-indigo-400 hover:underline mb-1">
            ← Back to Executions
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white tracking-tight">Execution Audit Record</h1>
            <StatusBadge status={execution.currentState} size="lg" />
          </div>
          <p className="font-mono text-xs text-slate-400 mt-1">{execution.id}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onExplain(execution.id)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition shadow-sm"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Decision Explanation
          </button>
        </div>
      </div>

      {/* Metadata Overview Card */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-[11px] text-slate-400 uppercase font-medium">Workflow</p>
          <p className="text-sm font-semibold text-white mt-0.5">{execution.workflow?.name || execution.workflowId}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 uppercase font-medium">Configuration Version</p>
          <p className="text-sm font-semibold text-white mt-0.5">Version {execution.version?.version || 1}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 uppercase font-medium">Final Decision</p>
          <p className="text-sm font-semibold text-emerald-400 mt-0.5">{execution.finalDecision || execution.currentState}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 uppercase font-medium">Correlation ID</p>
          <p className="font-mono text-xs text-slate-300 mt-0.5 truncate">{execution.correlationId}</p>
        </div>
      </div>

      {/* Detail Tabs */}
      <div className="border-b border-slate-700 flex gap-4">
        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-3 text-xs font-semibold transition border-b-2 ${
            activeTab === 'rules'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Rules Evaluated ({execution.ruleEvaluations?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-3 text-xs font-semibold transition border-b-2 ${
            activeTab === 'timeline'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          State Transitions ({execution.stateHistory?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('dependency')}
          className={`pb-3 text-xs font-semibold transition border-b-2 ${
            activeTab === 'dependency'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          External Retries ({execution.dependencyAttempts?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('input')}
          className={`pb-3 text-xs font-semibold transition border-b-2 ${
            activeTab === 'input'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Original Request Payload
        </button>
      </div>

      {/* Tab 1: Rules Evaluated */}
      {activeTab === 'rules' && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-5 py-3">Rule Name</th>
                <th className="px-5 py-3">Evaluated Field</th>
                <th className="px-5 py-3">Condition</th>
                <th className="px-5 py-3">Actual Value</th>
                <th className="px-5 py-3">Result</th>
                <th className="px-5 py-3">Explanation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 text-slate-200">
              {execution.ruleEvaluations?.map((r) => (
                <tr key={r.id} className="hover:bg-slate-700/20">
                  <td className="px-5 py-3 font-semibold text-white">{r.ruleName}</td>
                  <td className="px-5 py-3 font-mono text-indigo-400">{r.field}</td>
                  <td className="px-5 py-3 font-mono text-slate-300">
                    {r.operator} {JSON.stringify(r.expectedValue)}
                  </td>
                  <td className="px-5 py-3 font-mono font-bold text-white">
                    {r.actualValue !== null && r.actualValue !== undefined ? String(r.actualValue) : 'null'}
                  </td>
                  <td className="px-5 py-3">
                    {r.passed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                        <XCircle className="w-3.5 h-3.5" /> Failed ({r.failureAction})
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-300 max-w-sm">{r.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: State Transitions Timeline */}
      {activeTab === 'timeline' && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Immutable State Machine History</h3>
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-700">
            {execution.stateHistory?.map((item, idx) => (
              <div key={item.id} className="relative">
                <span className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-slate-900" />
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400">{item.fromState}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <StatusBadge status={item.toState} />
                  <span className="text-[11px] text-slate-500 ml-auto">
                    {new Date(item.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">{item.transitionReason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: External Dependency Attempts */}
      {activeTab === 'dependency' && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">External Integration & Exponential Backoff Attempts</h3>
          {execution.dependencyAttempts?.length === 0 ? (
            <p className="text-xs text-slate-500">No external dependency calls executed.</p>
          ) : (
            <div className="space-y-3">
              {execution.dependencyAttempts?.map((d) => (
                <div key={d.id} className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-700 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white">Attempt #{d.attemptNumber}</span>
                      <span className="font-mono text-[11px] text-indigo-400">{d.dependencyName}</span>
                    </div>
                    {d.errorMessage && (
                      <p className="text-xs text-rose-400 mt-1">Error: {d.errorMessage}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      d.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {d.status}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-1">{d.latencyMs}ms latency</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Raw Request Payload */}
      {activeTab === 'input' && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
          <pre className="font-mono text-xs text-slate-200 bg-slate-900 p-4 rounded-lg overflow-x-auto">
            {JSON.stringify(execution.inputData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

