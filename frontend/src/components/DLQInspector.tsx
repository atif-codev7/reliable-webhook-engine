'use client';

import React, { useState } from 'react';
import { WebhookJob } from '../lib/types';
import { retryDLQJob, retryAllDLQJobs } from '../lib/api';
import {
  AlertOctagon,
  RefreshCw,
  Eye,
  Check,
  AlertTriangle,
  History,
  Clock,
  Layers,
} from 'lucide-react';

interface DLQInspectorProps {
  dlqJobs: WebhookJob[];
  onRefresh: () => void;
}

export const DLQInspector: React.FC<DLQInspectorProps> = ({ dlqJobs, onRefresh }) => {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState<boolean>(false);
  const [selectedJob, setSelectedJob] = useState<WebhookJob | null>(null);

  const handleRetry = async (jobId: string) => {
    setRetryingId(jobId);
    try {
      await retryDLQJob(jobId);
      onRefresh();
    } catch (err: any) {
      alert(`Retry failed: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAll = async () => {
    if (!confirm(`Are you sure you want to re-trigger all ${dlqJobs.length} jobs in DLQ?`)) return;
    setRetryingAll(true);
    try {
      await retryAllDLQJobs();
      onRefresh();
    } catch (err: any) {
      alert(`Retry all failed: ${err.message}`);
    } finally {
      setRetryingAll(false);
    }
  };

  return (
    <div className="bg-[#0f172a]/70 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-rose-400" />
            Dead Letter Queue (DLQ) Inspector & Replay
          </h2>
          <p className="text-xs text-slate-400">
            Isolated tasks that exhausted their 5 exponential retries (1s, 2s, 4s, 8s, 16s)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
            title="Refresh DLQ"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          {dlqJobs.length > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-md shadow-rose-500/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${retryingAll ? 'animate-spin' : ''}`} />
              <span>Replay All ({dlqJobs.length})</span>
            </button>
          )}
        </div>
      </div>

      {dlqJobs.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-500 space-y-2 border border-dashed border-slate-800 rounded-xl">
          <Check className="h-8 w-8 text-emerald-400/80" />
          <p className="text-slate-300 font-medium text-sm">Dead Letter Queue is Empty</p>
          <p className="text-xs text-slate-500 max-w-sm text-center">
            All dispatched webhooks have been successfully delivered or are actively in retry loops.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="py-2.5 px-3">Job ID</th>
                <th className="py-2.5 px-3">Event Type</th>
                <th className="py-2.5 px-3">Attempts</th>
                <th className="py-2.5 px-3">Destination</th>
                <th className="py-2.5 px-3">Last Error</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {dlqJobs.map((job) => (
                <tr key={job.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 px-3 text-slate-300 truncate max-w-[120px]">
                    {job.id.slice(0, 8)}...
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                      {job.event_type}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-rose-950/40 border border-rose-900/40 text-rose-400 font-bold text-[11px]">
                      {job.attempts} / {job.max_retries}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-400 truncate max-w-[180px]">
                    {job.destination_url}
                  </td>
                  <td className="py-3 px-3 text-rose-300 truncate max-w-[220px]">
                    {job.last_error || 'Unknown Error'}
                  </td>
                  <td className="py-3 px-3 text-right space-x-2">
                    <button
                      onClick={() => setSelectedJob(job)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="Inspect Attempts Audit"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleRetry(job.id)}
                      disabled={retryingId === job.id}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-colors font-medium text-[11px] disabled:opacity-50"
                    >
                      {retryingId === job.id ? 'Requeueing...' : 'Retry'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal / Inspector for selected job */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="h-5 w-5 text-rose-400" />
                <h3 className="text-sm font-semibold text-white">
                  DLQ Audit Trail: {selectedJob.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <span className="text-slate-400">Event:</span> {selectedJob.event_type}
                </div>
                <div>
                  <span className="text-slate-400">Total Attempts:</span> {selectedJob.attempts}
                </div>
                <div className="col-span-2 truncate">
                  <span className="text-slate-400">Destination:</span> {selectedJob.destination_url}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                  <History className="h-3.5 w-3.5 text-amber-400" />
                  Execution Attempts History
                </h4>
                <div className="space-y-2">
                  {selectedJob.attempts_history?.length === 0 ? (
                    <div className="text-slate-500 p-2">No attempt logs recorded.</div>
                  ) : (
                    selectedJob.attempts_history?.map((att, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1"
                      >
                        <div className="flex items-center justify-between text-slate-300 font-semibold">
                          <span>Attempt #{att.attempt_number}</span>
                          <span
                            className={
                              att.status_code && att.status_code < 300
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }
                          >
                            {att.status_code ? `HTTP ${att.status_code}` : 'Network Failure'}
                          </span>
                        </div>
                        {att.error_message && (
                          <div className="text-rose-400 text-[11px]">{att.error_message}</div>
                        )}
                        <div className="flex items-center justify-between text-slate-500 text-[10px]">
                          <span>Duration: {att.duration_ms ?? 0} ms</span>
                          <span>{new Date(att.attempted_at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                  <Layers className="h-3.5 w-3.5 text-blue-400" />
                  Original Webhook Payload
                </h4>
                <pre className="p-3 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 overflow-x-auto text-[11px]">
                  {typeof selectedJob.payload === 'string'
                    ? selectedJob.payload
                    : JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleRetry(selectedJob.id);
                  setSelectedJob(null);
                }}
                className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium"
              >
                Replay From DLQ Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
