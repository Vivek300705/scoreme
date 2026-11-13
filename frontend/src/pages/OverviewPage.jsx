import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Activity,
  Layers,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../api/client';

export function OverviewPage({ onViewExecution, onSelectWorkflow }) {
  const [metrics, setMetrics] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [metricsRes, executionsRes] = await Promise.all([
        api.getMetrics(),
        api.listExecutions({ limit: 20 })
      ]);
      setMetrics(metricsRes.data);
      setExecutions(executionsRes.data);
    } catch (err) {
      console.error('Failed to load overview data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const chartData = metrics
    ? [
        { name: 'Approved', count: metrics.approved, fill: '#10b981' },
        { name: 'Rejected', count: metrics.rejected, fill: '#f43f5e' },
        { name: 'Review', count: metrics.pendingReview, fill: '#f59e0b' },
        { name: 'Failed', count: metrics.failed, fill: '#ef4444' }
      ]
    : [];

  const pieData = metrics
    ? [
        { name: 'Approved', value: metrics.approved || 0, color: '#10b981' },
        { name: 'Rejected', value: metrics.rejected || 0, color: '#f43f5e' },
        { name: 'Review', value: metrics.pendingReview || 0, color: '#f59e0b' }
      ].filter(d => d.value > 0)
    : [];

  const filteredExecutions = executions.filter(e => {
    if (filterStatus === 'ALL') return true;
    return e.currentState === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Performance & Decision Overview</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time telemetry, state machine progression, and business rule outcomes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => onSelectWorkflow('loan-approval')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 shadow-sm transition"
          >
            Execute Workflow
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Executions"
          value={metrics ? metrics.totalExecutions : '-'}
          subtitle="All lifecycle stages"
          icon={Layers}
          color="indigo"
        />
        <StatCard
          title="Approved"
          value={metrics ? metrics.approved : '-'}
          subtitle={`${metrics ? metrics.successRate : 0}% success rate`}
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="Rejected"
          value={metrics ? metrics.rejected : '-'}
          subtitle="Mandatory rule stops"
          icon={XCircle}
          color="rose"
        />
        <StatCard
          title="Pending Review"
          value={metrics ? metrics.pendingReview : '-'}
          subtitle="Awaiting underwriter"
          icon={Clock}
          color="amber"
        />
        <StatCard
          title="Failed / Retried"
          value={metrics ? metrics.failed + (metrics.retrying || 0) : '-'}
          subtitle="Infrastructure errors"
          icon={AlertTriangle}
          color="purple"
        />
      </div>

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outcome Breakdown Bar Chart */}
        <div className="lg:col-span-2 bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-white">Execution Volume by Outcome</h3>
              <p className="text-xs text-slate-400">Deterministic business decisions across all active workflows</p>
            </div>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#f8fafc'
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Outcome Share Pie Chart */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Decision Share</h3>
            <p className="text-xs text-slate-400">Ratio of approval vs rejection vs review</p>
          </div>
          <div className="h-48 w-full my-auto flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#f8fafc'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-500">No executions recorded yet</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-700/60 text-center">
            <div>
              <p className="text-[11px] text-slate-400">Approved</p>
              <p className="text-sm font-bold text-emerald-400">{metrics?.approved || 0}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Rejected</p>
              <p className="text-sm font-bold text-rose-400">{metrics?.rejected || 0}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Review</p>
              <p className="text-sm font-bold text-amber-400">{metrics?.pendingReview || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Executions Table */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-700/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Recent Workflow Executions</h3>
            <p className="text-xs text-slate-400">Inspect full state history, rule traces, and audit logs</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Filter Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All States</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="MANUAL_REVIEW">Manual Review</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-5 py-3">Execution ID</th>
                <th className="px-5 py-3">Workflow</th>
                <th className="px-5 py-3">Current State</th>
                <th className="px-5 py-3">Decision Reason</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 text-slate-200">
              {filteredExecutions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    No executions found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredExecutions.map((exec) => (
                  <tr
                    key={exec.id}
                    className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                    onClick={() => onViewExecution(exec.id)}
                  >
                    <td className="px-5 py-3.5 font-mono text-indigo-400 font-medium">
                      {exec.id.substring(0, 8)}...
                    </td>
                    <td className="px-5 py-3.5 font-medium text-white">
                      {exec.workflow?.name || exec.workflowId}
                      <span className="ml-2 text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-700">
                        v{exec.version?.version || 1}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={exec.currentState} />
                    </td>
                    <td className="px-5 py-3.5 max-w-xs truncate text-slate-300" title={exec.decisionReason}>
                      {exec.decisionReason || 'Processing in progress'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">
                      {new Date(exec.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewExecution(exec.id);
                        }}
                        className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                      >
                        Explain & Trace →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

