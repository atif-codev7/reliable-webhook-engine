'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SSEEvent } from '../lib/types';
import {
  Radio,
  Trash2,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  Zap,
  ShieldAlert,
  ArrowRight,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface LiveStreamFeedProps {
  events: SSEEvent[];
  onClear: () => void;
  sseStatus: string;
}

export const LiveStreamFeed: React.FC<LiveStreamFeedProps> = ({
  events,
  onClear,
  sseStatus,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const filteredEvents = events.filter((ev) => {
    if (filterType === 'ALL') return true;
    return ev.type === filterType;
  });

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'JOB_DISPATCHED':
        return {
          bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
          icon: Zap,
          label: 'DISPATCHED',
        };
      case 'JOB_PROCESSING':
        return {
          bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          icon: Clock,
          label: 'PROCESSING',
        };
      case 'JOB_RETRY_SCHEDULED':
        return {
          bg: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
          icon: Clock,
          label: 'BACKOFF RETRY',
        };
      case 'JOB_COMPLETED':
        return {
          bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          icon: CheckCircle,
          label: 'COMPLETED',
        };
      case 'JOB_DEAD_LETTERED':
        return {
          bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          icon: AlertCircle,
          label: 'DEAD LETTER (DLQ)',
        };
      case 'JOB_RECOVERED_FROM_CRASH':
        return {
          bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          icon: ShieldAlert,
          label: 'KILL-9 RECOVERED',
        };
      case 'DLQ_MANUAL_RETRY':
        return {
          bg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
          icon: Zap,
          label: 'MANUAL RETRY',
        };
      default:
        return {
          bg: 'bg-slate-700/30 text-slate-300 border-slate-600',
          icon: Radio,
          label: type,
        };
    }
  };

  return (
    <div className="bg-[#0f172a]/70 border border-slate-800 rounded-2xl flex flex-col h-[560px] backdrop-blur-md overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-white">
            Real-Time SSE Event Stream
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
            {filteredEvents.length} events
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter dropdown */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Events</option>
            <option value="JOB_DISPATCHED">Dispatched</option>
            <option value="JOB_PROCESSING">Processing</option>
            <option value="JOB_RETRY_SCHEDULED">Retries / Backoff</option>
            <option value="JOB_COMPLETED">Completed</option>
            <option value="JOB_DEAD_LETTERED">Dead Letter (DLQ)</option>
            <option value="JOB_RECOVERED_FROM_CRASH">Kill-9 Recovered</option>
          </select>

          {/* Auto-scroll checkbox */}
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
            />
            <span>Auto-scroll</span>
          </label>

          {/* Clear button */}
          <button
            onClick={onClear}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
            title="Clear Stream History"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stream List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 p-4 overflow-y-auto space-y-2.5 font-mono text-xs"
      >
        {filteredEvents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
            <Radio className="h-8 w-8 text-slate-600 animate-pulse" />
            <p>Listening for real-time SSE delivery events...</p>
            <p className="text-[11px] text-slate-600">
              Dispatch a webhook above to watch live state transitions
            </p>
          </div>
        ) : (
          filteredEvents.map((ev, index) => {
            const badge = getEventBadge(ev.type);
            const Icon = badge.icon;
            const isExpanded = expandedIndex === index;

            return (
              <div
                key={index}
                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all"
              >
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge.bg}`}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{badge.label}</span>
                    </span>

                    {ev.job_id && (
                      <span className="text-slate-400 truncate max-w-[120px] sm:max-w-[200px]">
                        ID: <span className="text-slate-200">{ev.job_id.slice(0, 8)}...</span>
                      </span>
                    )}

                    {ev.data?.attempt && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px]">
                        Attempt {ev.data.attempt}/{ev.data.max_retries || 5}
                      </span>
                    )}

                    {ev.data?.backoff_delay_sec && (
                      <span className="text-orange-400 text-[11px]">
                        Backoff delay: {ev.data.backoff_delay_sec}s
                      </span>
                    )}

                    {ev.data?.status_code && (
                      <span
                        className={`text-[11px] font-bold ${
                          ev.data.status_code < 300 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        HTTP {ev.data.status_code}
                      </span>
                    )}

                    {ev.data?.duration_ms && (
                      <span className="text-cyan-400 text-[10px]">
                        {ev.data.duration_ms} ms
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                    <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800 text-[11px]">
                    <div className="text-slate-400 mb-1">
                      Full Timestamp: <span className="text-slate-200">{ev.timestamp}</span>
                    </div>
                    {ev.data?.error && (
                      <div className="text-rose-400 bg-rose-950/20 p-2 rounded border border-rose-900/40 mb-2">
                        {ev.data.error}
                      </div>
                    )}
                    <pre className="p-2 rounded bg-slate-950/70 text-slate-300 overflow-x-auto border border-slate-800/80">
                      {JSON.stringify(ev.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
