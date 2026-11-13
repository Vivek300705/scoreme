import React, { useState, useEffect } from 'react';
import { Zap, AlertTriangle, Play, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export function ChaosSimulationPage({ onViewExecution }) {
  const [currentMode, setCurrentMode] = useState('NONE');
  const [latencyMs, setLatencyMs] = useState(50);
  const [availableModes, setAvailableModes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fetchSimulationState = async () => {
    try {
      setLoading(true);
      const res = await api.getFailureMode();
      setCurrentMode(res.data.currentMode);
      setLatencyMs(res.data.latencyMs);
      setAvailableModes(res.data.availableModes || []);
    } catch (e) {
      console.error('Failed to get simulation mode:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSimulationState();
  }, []);

  const handleApplyMode = async (mode, lat = latencyMs) => {
    try {
      setUpdating(true);
      setFeedback(null);
      await api.setFailureMode(mode, lat);
      setCurrentMode(mode);
      setFeedback(`Simulation mode set to ${mode} (${lat}ms simulated latency).`);
    } catch (err) {
      setFeedback(`Failed to update mode: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleRunChaosTest = async () => {
    try {
      setTesting(true);
      setTestResult(null);

      // Execute a test loan application under active chaos conditions
      const res = await api.executeWorkflow('loan-approval', {
        applicantName: 'Chaos Test Applicant',
        age: 35,
        monthlyIncome: 80000,
        requestedAmount: 200000,
        creditScore: 780,
        employmentStatus: 'EMPLOYED',
        existingMonthlyDebt: 10000
      });

      // Fetch full details with attempts
      const details = await api.getExecution(res.executionId);
      setTestResult(details.data);
    } catch (err) {
      setFeedback(`Execution error: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const MODE_DESCRIPTIONS = {
    NONE: 'Normal healthy operation. All external services respond successfully with 0 retries.',
    TIMEOUT: 'Persistent ETIMEDOUT (HTTP 408). Retries up to max limit (3 attempts) with exponential backoff, then marks FAILED.',
    SERVICE_UNAVAILABLE: 'Persistent HTTP 503 Service Unavailable. Triggers retry backoff, then marks FAILED.',
    RATE_LIMIT: 'HTTP 429 Rate Limit Exceeded. Demonstrates retry with exponential backoff and jitter.',
    PERMANENT_ERROR: 'HTTP 400 Bad Request. Immediate failure with ZERO retries (infrastructure error classification).',
    FAIL_ONCE_THEN_SUCCEED: 'Transient network glitch: Fails attempt 1, retries, and succeeds on attempt 2! (State: APPROVED).',
    FAIL_TWICE_THEN_SUCCEED: 'Prolonged transient outage: Fails attempt 1 & 2, succeeds on attempt 3! (State: APPROVED).'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Chaos Testing & Resilience Simulation</h1>
        <p className="text-sm text-slate-400 mt-1">
          Inject simulated infrastructure outages and verify exponential backoff, retry exhaustion, and classification.
        </p>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)}>✕</button>
        </div>
      )}

      {/* Mode Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {availableModes.map((mode) => {
          const isSelected = currentMode === mode;
          const isHealthy = mode === 'NONE';
          const isTransient = mode.includes('THEN_SUCCEED');
          return (
            <div
              key={mode}
              onClick={() => handleApplyMode(mode)}
              className={`p-5 rounded-xl border transition-all cursor-pointer relative ${
                isSelected
                  ? 'bg-slate-800 border-indigo-500 shadow-lg shadow-indigo-500/15 ring-1 ring-indigo-500'
                  : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-white">{mode}</span>
                {isSelected && (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-500 text-white">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
                {MODE_DESCRIPTIONS[mode] || 'Simulated failure pattern.'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Latency Config & Live Trigger */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white">Simulated Latency Overhead</h3>
          <p className="text-xs text-slate-400">Controls external dependency invocation duration: {latencyMs}ms</p>
          <input
            type="range"
            min="10"
            max="1500"
            step="50"
            value={latencyMs}
            onChange={(e) => {
              const val = Number(e.target.value);
              setLatencyMs(val);
              handleApplyMode(currentMode, val);
            }}
            className="w-48 accent-indigo-500 mt-2"
          />
        </div>

        <button
          disabled={testing}
          onClick={handleRunChaosTest}
          className="py-3 px-6 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Play className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
          {testing ? 'Testing Resilience Engine...' : `Trigger Live Chaos Test (${currentMode})`}
        </button>
      </div>

      {/* Live Test Outcome Observation */}
      {testResult && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700">
            <div>
              <h3 className="text-base font-bold text-white">Chaos Experiment Outcome</h3>
              <p className="text-xs text-slate-400">Execution: {testResult.id}</p>
            </div>
            <StatusBadge status={testResult.currentState} size="lg" />
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              External Dependency Attempts Recorded ({testResult.dependencyAttempts?.length || 0})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {testResult.dependencyAttempts?.map((d) => (
                <div key={d.id} className="p-3.5 rounded-lg bg-slate-900 border border-slate-700 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Attempt #{d.attemptNumber}</span>
                    <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${
                      d.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {d.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">Latency: {d.latencyMs}ms</p>
                  {d.errorMessage && (
                    <p className="text-[11px] text-rose-400 font-mono line-clamp-2">{d.errorMessage}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => onViewExecution(testResult.id)}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
            >
              Inspect Complete State History & Audit Log →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

