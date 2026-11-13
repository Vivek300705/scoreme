import React, { useState, useEffect } from 'react';
import { Users, CheckCircle2, XCircle, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export function ManualReviewPage({ onReviewsUpdated }) {
  const [pendingReviews, setPendingReviews] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [reviewerId, setReviewerId] = useState('underwriter-lead');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const res = await api.listPendingReviews();
      setPendingReviews(res.data);
      if (res.data.length > 0 && !selectedReview) {
        setSelectedReview(res.data[0]);
      } else if (res.data.length === 0) {
        setSelectedReview(null);
      }
      if (onReviewsUpdated) {
        onReviewsUpdated(res.data.length);
      }
    } catch (e) {
      console.error('Failed to load pending reviews:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleDecision = async (decision) => {
    if (!selectedReview) return;
    try {
      setActionLoading(true);
      setFeedback(null);
      await api.submitReview(
        selectedReview.executionId,
        decision,
        reviewerId,
        reviewerNotes || `Decided as ${decision} via underwriter console`
      );

      setFeedback({
        type: 'success',
        message: `Execution ${selectedReview.executionId.substring(0, 8)}... successfully ${decision}!`
      });

      setReviewerNotes('');
      await fetchReviews();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Failed to resolve review: ${err.message}`
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Underwriter Manual Review Queue</h1>
          <p className="text-sm text-slate-400 mt-1">
            Borderline risk requests requiring human discretion and recorded audit sign-off.
          </p>
        </div>
        <button
          onClick={fetchReviews}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Queue ({pendingReviews.length})
        </button>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between ${
          feedback.type === 'success'
            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
        }`}>
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)}>✕</button>
        </div>
      )}

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Pending Queue */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Pending Applications ({pendingReviews.length})
          </h3>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">Loading queue...</div>
          ) : pendingReviews.length === 0 ? (
            <div className="p-8 rounded-xl bg-slate-800/40 border border-slate-700/60 text-center text-slate-400 text-xs space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="font-semibold text-white">Queue Clear!</p>
              <p>No applications currently waiting for manual underwriter review.</p>
            </div>
          ) : (
            pendingReviews.map((review) => {
              const isSelected = selectedReview?.id === review.id;
              const exec = review.execution;
              return (
                <div
                  key={review.id}
                  onClick={() => setSelectedReview(review)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800 border-amber-500/60 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-amber-400 font-semibold">
                      {review.executionId.substring(0, 8)}...
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(review.assignedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1">
                    {exec?.workflow?.name || 'Loan Application'}
                  </h4>
                  <p className="text-xs text-slate-300 mt-1">
                    Applicant: {exec?.inputData?.applicantName || exec?.inputData?.claimantName || 'Unknown'}
                  </p>
                  <p className="text-[11px] text-amber-400/90 mt-1 line-clamp-1">
                    Reason: {exec?.decisionReason || 'Borderline condition'}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Review Workspace & Adjudication Action */}
        <div className="lg:col-span-2 space-y-4">
          {selectedReview ? (
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 space-y-6">
              <div className="flex items-start justify-between pb-4 border-b border-slate-700">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    Application Under Review
                  </span>
                  <h2 className="text-lg font-bold text-white mt-1">
                    {selectedReview.execution?.workflow?.name}
                  </h2>
                  <p className="font-mono text-xs text-slate-400">
                    Execution ID: {selectedReview.executionId}
                  </p>
                </div>
                <StatusBadge status="MANUAL_REVIEW" size="lg" />
              </div>

              {/* Applicant / Payload Data */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Application Parameters
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-900/80 border border-slate-700/60 text-xs">
                  {Object.entries(selectedReview.execution?.inputData || {}).map(([key, val]) => (
                    <div key={key}>
                      <span className="text-slate-400">{key}:</span>
                      <p className="font-bold text-white mt-0.5">{String(val)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Borderline Factor Alert */}
              <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  Borderline Trigger Reason:
                </p>
                <p className="text-slate-200">
                  {selectedReview.execution?.decisionReason || 'Credit score or claim amount in manual review band.'}
                </p>
              </div>

              {/* Decision Console */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-700 space-y-4">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Adjudication Decision
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400">Reviewer ID / Signature</label>
                    <input
                      type="text"
                      value={reviewerId}
                      onChange={(e) => setReviewerId(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400">Underwriter Notes & Justification (Mandatory for Audit)</label>
                  <textarea
                    rows={3}
                    placeholder="Provide justification for approval or denial..."
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    className="w-full mt-1 p-3 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleDecision('APPROVED')}
                    className="flex-1 py-2.5 px-4 rounded-lg font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve Application
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleDecision('REJECTED')}
                    className="flex-1 py-2.5 px-4 rounded-lg font-bold text-xs text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject Application
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center rounded-xl bg-slate-800/40 border border-slate-700/40 text-slate-500 text-xs">
              Select an application on the left to review its parameters and make an adjudication.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

