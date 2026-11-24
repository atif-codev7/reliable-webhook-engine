'use client';

import React, { useState } from 'react';
import { WebhookJob } from '../lib/types';
import { retryDLQJob, retryAllDLQJobs } from '../lib/api';
import {
  AlertOctagon,
  RefreshCw,
  Eye,
  Check,
  History,
  Layers,
  X,
  Loader2,
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
    if (!confirm(`Re-queue all ${dlqJobs.length} tasks in the dead letter queue?`)) return;
    setRetryingAll(true);
    try {
      await retryAllDLQJobs();
      onRefresh();
    } catch (err: any) {
      alert(`Batch retry failed: ${err.message}`);
    } finally {
      setRetryingAll(false);
    }
  };

  return (
    <div className="bg-[#11141c] border border-white/[0.08] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-medium text-[#eef0f5] flex items-center gap-2">
            <span>Dead letter queue</span>
            {dlqJobs.length > 0 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#e5484d]/10 text-[#e5484d] border border-[#e5484d]/20">
                {dlqJobs.length} isolated
              </span>
            )}
          </h2>
          <p className="text-xs text-[#7a8296] mt-0.5">
            Quarantined tasks that failed all 5 delivery attempts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-1.5 text-[#7a8296] hover:text-[#eef0f5] rounded-md hover:bg-[#1a1e28] transition-colors"
            title="Refresh queue"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          {dlqJobs.length > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="h-8 px-3 rounded-md bg-[#1a1e28] hover:bg-[#252b3a] border border-white/[0.08] text-[#eef0f5] text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-50"
            >
              {retryingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a3a9b8]" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-[#a3a9b8]" />
              )}
              <span>Replay all</span>
            </button>
          )}
        </div>
      </div>

      {dlqJobs.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-[#7a8296] space-y-1.5 border border-dashed border-white/[0.08] rounded-lg">
          <Check className="h-5 w-5 text-[#4cc38a]" />
          <p className="text-xs text-[#a3a9b8]">Dead letter queue is empty</p>
          <p className="text-[11px] text-[#7a8296]">
            All dispatched webhooks have delivered or are within active backoff schedules
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.06] text-[#7a8296] font-normal">
                <th className="py-2 px-3 font-normal">Job ID</th>
                <th className="py-2 px-3 font-normal">Event</th>
                <th className="py-2 px-3 font-normal">Attempts</th>
                <th className="py-2 px-3 font-normal">Destination</th>
                <th className="py-2 px-3 font-normal">Last error</th>
                <th className="py-2 px-3 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {dlqJobs.map((job) => (
                <tr key={job.id} className="hover:bg-[#141722] transition-colors">
                  <td className="py-2.5 px-3 text-[#a3a9b8] truncate max-w-[110px]">
                    {job.id.slice(0, 8)}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-1.5 py-0.5 rounded bg-[#1a1e28] text-[#a3a9b8] text-[11px]">
                      {job.event_type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-[#e5484d] text-[11px] font-medium tabular-nums">
                      {job.attempts}/{job.max_retries}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-[#7a8296] truncate max-w-[180px]">
                    {job.destination_url}
                  </td>
                  <td className="py-2.5 px-3 text-[#e5484d] truncate max-w-[200px]">
                    {job.last_error || 'Delivery timeout'}
                  </td>
                  <td className="py-2.5 px-3 text-right space-x-1.5">
                    <button
                      onClick={() => setSelectedJob(job)}
                      className="px-2 py-1 rounded bg-[#1a1e28] hover:bg-[#252b3a] text-[#a3a9b8] hover:text-[#eef0f5] text-[11px] transition-colors"
                      title="Inspect attempt logs"
                    >
                      Inspect
                    </button>
                    <button
                      onClick={() => handleRetry(job.id)}
                      disabled={retryingId === job.id}
                      className="px-2 py-1 rounded bg-[#1a1e28] hover:bg-[#252b3a] text-[#eef0f5] text-[11px] transition-colors border border-white/[0.06] disabled:opacity-50"
                    >
                      {retryingId === job.id ? 'Requeuing...' : 'Replay'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inspect Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#11141c] border border-white/[0.12] rounded-lg max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-xl">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0d1017]">
              <div>
                <h3 className="text-sm font-medium text-[#eef0f5]">
                  Task audit: {selectedJob.id}
                </h3>
                <p className="text-xs text-[#7a8296] font-mono mt-0.5">
                  {selectedJob.event_type} · {selectedJob.attempts} attempts
                </p>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-[#7a8296] hover:text-[#eef0f5] p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-[#0d1017] border border-white/[0.04]">
                <div>
                  <span className="text-[#7a8296]">Destination:</span>{' '}
                  <span className="text-[#a3a9b8] truncate">{selectedJob.destination_url}</span>
                </div>
                <div>
                  <span className="text-[#7a8296]">Final status:</span>{' '}
                  <span className="text-[#e5484d]">HTTP {selectedJob.last_status_code || 500}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-normal text-[#7a8296] mb-2 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Attempt chronology
                </h4>
                <div className="space-y-1.5">
                  {selectedJob.attempts_history?.length === 0 ? (
                    <div className="text-[#7a8296] p-2">No attempt records logged</div>
                  ) : (
                    selectedJob.attempts_history?.map((att, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded bg-[#0d1017] border border-white/[0.04] space-y-1"
                      >
                        <div className="flex items-center justify-between text-[#a3a9b8]">
                          <span>Attempt {att.attempt_number}</span>
                          <span
                            className={
                              att.status_code && att.status_code < 300
                                ? 'text-[#4cc38a]'
                                : 'text-[#e5484d]'
                            }
                          >
                            {att.status_code ? `HTTP ${att.status_code}` : 'Connection error'}
                          </span>
                        </div>
                        {att.error_message && (
                          <div className="text-[#e5484d] text-[11px]">{att.error_message}</div>
                        )}
                        <div className="flex items-center justify-between text-[#7a8296] text-[10px]">
                          <span>Duration: {att.duration_ms ?? 0} ms</span>
                          <span>{new Date(att.attempted_at).toLocaleTimeString([], { hour12: false })}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-normal text-[#7a8296] mb-2 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  Payload data
                </h4>
                <pre className="p-2.5 rounded bg-[#07080d] text-[#a3a9b8] border border-white/[0.06] overflow-x-auto text-[11px] leading-relaxed">
                  {typeof selectedJob.payload === 'string'
                    ? selectedJob.payload
                    : JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-3 border-t border-white/[0.08] flex justify-end gap-2 bg-[#0d1017]">
              <button
                onClick={() => setSelectedJob(null)}
                className="h-8 px-3 rounded-md bg-[#1a1e28] hover:bg-[#252b3a] text-[#a3a9b8] text-xs font-medium transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleRetry(selectedJob.id);
                  setSelectedJob(null);
                }}
                className="h-8 px-3 rounded-md bg-[#eef0f5] hover:bg-white text-[#07080d] text-xs font-medium transition-colors"
              >
                Replay task now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
