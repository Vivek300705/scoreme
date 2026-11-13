import React, { useState, useEffect } from 'react';
import { GitFork, Check, Play, FileCode, CheckCircle2, RefreshCw } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../api/client';

export function WorkflowsPage({ onExecuteWorkflow }) {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const res = await api.listWorkflows();
      setWorkflows(res.data);
      if (res.data.length > 0 && !selectedWorkflow) {
        setSelectedWorkflow(res.data[0]);
      } else if (selectedWorkflow) {
        // Refresh selected workflow object
        const updated = res.data.find(w => w.id === selectedWorkflow.id);
        if (updated) setSelectedWorkflow(updated);
      }
    } catch (err) {
      console.error('Failed to load workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleActivateVersion = async (workflowId, versionNumber) => {
    try {
      setActivating(true);
      setMessage(null);
      await api.activateVersion(workflowId, versionNumber);
      setMessage(`Version ${versionNumber} activated successfully! Future executions will use this policy.`);
      await fetchWorkflows();
    } catch (err) {
      setMessage(`Error activating version: ${err.message}`);
    } finally {
      setActivating(false);
    }
  };

  const activeVersion = selectedWorkflow?.versions?.find(v => v.status === 'ACTIVE') || selectedWorkflow?.versions?.[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Workflow Catalog & Version Control</h1>
          <p className="text-sm text-slate-400 mt-1">
            Declarative JSON rule configurations, version history, and zero-code policy adjustments.
          </p>
        </div>
        <button
          onClick={fetchWorkflows}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div className="p-3.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-indigo-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Workflow List */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider text-xs">Available Workflows</h3>
          {workflows.map((wf) => {
            const isSelected = selectedWorkflow?.id === wf.id;
            const currentActiveVer = wf.versions?.find(v => v.status === 'ACTIVE');
            return (
              <div
                key={wf.id}
                onClick={() => setSelectedWorkflow(wf)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 border-indigo-500/60 shadow-lg shadow-indigo-500/10'
                    : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                      <GitFork className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{wf.name}</h4>
                      <p className="text-[11px] font-mono text-slate-400">{wf.workflowKey}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Active: v{currentActiveVer?.version || 1}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2 line-clamp-2">{wf.description}</p>
              </div>
            );
          })}
        </div>

        {/* Right: Selected Workflow Details & Versions */}
        <div className="lg:col-span-2 space-y-6">
          {selectedWorkflow ? (
            <>
              {/* Header Card */}
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-bold text-white">{selectedWorkflow.name}</h2>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                        {selectedWorkflow.workflowKey}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{selectedWorkflow.description}</p>
                  </div>
                  <button
                    onClick={() => onExecuteWorkflow(selectedWorkflow.workflowKey)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Execute Workflow
                  </button>
                </div>

                {/* Versions Bar */}
                <div className="mt-5 pt-4 border-t border-slate-700/60">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Version History</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedWorkflow.versions?.map((ver) => {
                      const isActive = ver.status === 'ACTIVE';
                      return (
                        <div
                          key={ver.id}
                          className={`p-3.5 rounded-lg border flex items-center justify-between ${
                            isActive
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : 'bg-slate-900/60 border-slate-700 text-slate-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white">Version {ver.version}</span>
                              <StatusBadge status={ver.status} size="sm" />
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                              {ver.stages?.length || 0} stages • {ver.stages?.reduce((acc, s) => acc + (s.rules?.length || 0), 0)} rules
                            </p>
                          </div>
                          {!isActive && (
                            <button
                              disabled={activating}
                              onClick={() => handleActivateVersion(selectedWorkflow.id, ver.version)}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Stages & Rules Inspection */}
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-white">Configured Stages (Active Policy v{activeVersion?.version})</h3>
                    <p className="text-xs text-slate-400">Deterministic pipeline execution sequence</p>
                  </div>
                  <FileCode className="w-4 h-4 text-slate-400" />
                </div>

                <div className="space-y-3">
                  {activeVersion?.stages?.map((stage, idx) => (
                    <div key={stage.id} className="p-4 rounded-lg bg-slate-900/60 border border-slate-700/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <h4 className="text-sm font-bold text-white">{stage.name}</h4>
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          type: {stage.type}
                        </span>
                      </div>

                      {stage.rules && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-[11px] font-medium text-slate-400">Evaluated Rules:</p>
                          <div className="grid grid-cols-1 gap-1.5">
                            {stage.rules.map((rule) => (
                              <div
                                key={rule.id}
                                className="flex items-center justify-between px-3 py-2 rounded bg-slate-800/80 text-xs border border-slate-700/40"
                              >
                                <div>
                                  <span className="font-semibold text-slate-200">{rule.name}</span>
                                  <span className="ml-2 font-mono text-[11px] text-indigo-400">
                                    {rule.field} {rule.operator} {JSON.stringify(rule.value)}
                                  </span>
                                </div>
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                  rule.failureAction === 'reject' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                                }`}>
                                  fail: {rule.failureAction}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {stage.dependencyName && (
                        <div className="mt-2 p-2.5 rounded bg-slate-800/80 border border-slate-700/40 text-xs">
                          <span className="text-slate-400">External Integration: </span>
                          <span className="font-mono text-indigo-400 font-semibold">{stage.dependencyName}</span>
                          <span className="ml-3 text-slate-400">
                            Max Retries: {stage.retryPolicy?.maxRetries || 3} (Exponential Backoff)
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-500">Select a workflow to view its configuration.</div>
          )}
        </div>
      </div>
    </div>
  );
}

