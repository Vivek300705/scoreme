import React from 'react';

const STATUS_CONFIGS = {
  APPROVED: {
    bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-400',
    label: 'Approved'
  },
  REJECTED: {
    bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    dot: 'bg-rose-400',
    label: 'Rejected'
  },
  MANUAL_REVIEW: {
    bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-400',
    label: 'Manual Review'
  },
  PROCESSING: {
    bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    dot: 'bg-blue-400 animate-pulse',
    label: 'Processing'
  },
  VALIDATED: {
    bg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    dot: 'bg-cyan-400',
    label: 'Validated'
  },
  RECEIVED: {
    bg: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    dot: 'bg-slate-400',
    label: 'Received'
  },
  RETRY_PENDING: {
    bg: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    dot: 'bg-purple-400 animate-pulse',
    label: 'Retry Pending'
  },
  FAILED: {
    bg: 'bg-red-500/20 text-red-400 border-red-500/40',
    dot: 'bg-red-400',
    label: 'Failed'
  },
  ACTIVE: {
    bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-400',
    label: 'Active'
  },
  DRAFT: {
    bg: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    dot: 'bg-slate-400',
    label: 'Draft'
  },
  ARCHIVED: {
    bg: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    dot: 'bg-zinc-400',
    label: 'Archived'
  }
};

export function StatusBadge({ status, size = 'sm' }) {
  const config = STATUS_CONFIGS[status] || {
    bg: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    dot: 'bg-slate-400',
    label: status || 'Unknown'
  };

  const sizeClasses = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.bg} ${sizeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

