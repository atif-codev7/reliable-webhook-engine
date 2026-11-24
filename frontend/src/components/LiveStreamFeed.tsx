'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SSEEvent } from '../lib/types';
import {
  Trash2,
  Check,
  AlertCircle,
  Clock,
  Zap,
  Shield,
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
          bg: 'bg-[#1a1e28] text-[#a3a9b8] border-white/[0.08]',
          icon: Zap,
          label: 'Dispatched',
        };
      case 'JOB_PROCESSING':
        return {
          bg: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20',
          icon: Clock,
          label: 'Processing',
        };
      case 'JOB_RETRY_SCHEDULED':
        return {
          bg: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20',
          icon: Clock,
          label: 'Backoff retry',
        };
      case 'JOB_COMPLETED':
        return {
          bg: 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/20',
          icon: Check,
          label: 'Completed',
        };
      case 'JOB_DEAD_LETTERED':
        return {
          bg: 'bg-[#e5484d]/10 text-[#e5484d] border-[#e5484d]/20',
          icon: AlertCircle,
          label: 'Dead letter',
        };
      case 'JOB_RECOVERED_FROM_CRASH':
        return {
          bg: 'bg-[#1a1e28] text-[#eef0f5] border-white/[0.14]',
          icon: Shield,
          label: 'Crash recovered',
        };
      case 'DLQ_MANUAL_RETRY':
        return {
          bg: 'bg-[#1a1e28] text-[#a3a9b8] border-white/[0.08]',
          icon: Zap,
          label: 'Manual retry',
        };
      default:
        return {
          bg: 'bg-[#11141c] text-[#7a8296] border-white/[0.06]',
          icon: Zap,
          label: type,
        };
    }
  };

  return (
    <div className="bg-[#11141c] border border-white/[0.08] rounded-lg flex flex-col h-[520px] overflow-hidden">
      {/* Header & Controls */}
      <div className="p-3.5 border-b border-white/[0.08] bg-[#0d1017] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[#eef0f5]">
            Telemetry stream
          </h3>
          <span className="text-xs font-mono text-[#7a8296]">
            ({filteredEvents.length})
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Filter dropdown */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-xs bg-[#11141c] border border-white/[0.08] rounded-md px-2.5 py-1 text-[#a3a9b8] focus:outline-none"
          >
            <option value="ALL">All events</option>
            <option value="JOB_DISPATCHED">Dispatched</option>
            <option value="JOB_PROCESSING">Processing</option>
            <option value="JOB_RETRY_SCHEDULED">Backoff retries</option>
            <option value="JOB_COMPLETED">Completed</option>
            <option value="JOB_DEAD_LETTERED">Dead letter</option>
            <option value="JOB_RECOVERED_FROM_CRASH">Crash recovered</option>
          </select>

          {/* Auto-scroll toggle */}
          <label className="flex items-center gap-1.5 text-xs text-[#7a8296] cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-[#11141c] border-white/[0.10] text-[#a3a9b8] focus:ring-0"
            />
            <span>Auto-scroll</span>
          </label>

          {/* Clear button */}
          <button
            onClick={onClear}
            className="p-1 text-[#7a8296] hover:text-[#eef0f5] rounded hover:bg-[#1a1e28] transition-colors"
            title="Clear stream"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Stream List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 p-3 overflow-y-auto space-y-1.5 font-mono text-xs"
      >
        {filteredEvents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#7a8296] space-y-1">
            <p className="text-xs font-normal">Awaiting webhook delivery events...</p>
            <p className="text-[11px] text-[#7a8296]">
              Dispatch a task from the bench to inspect live state transitions
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
                className="p-2.5 rounded-md bg-[#0d1017] border border-white/[0.04] hover:border-white/[0.08] transition-colors"
              >
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${badge.bg}`}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{badge.label}</span>
                    </span>

                    {ev.job_id && (
                      <span className="text-[#7a8296] truncate max-w-[130px] sm:max-w-[180px]">
                        id: <span className="text-[#a3a9b8]">{ev.job_id.slice(0, 8)}</span>
                      </span>
                    )}

                    {ev.data?.attempt && (
                      <span className="text-[11px] text-[#7a8296]">
                        attempt {ev.data.attempt}/{ev.data.max_retries || 5}
                      </span>
                    )}

                    {ev.data?.backoff_delay_sec && (
                      <span className="text-[#f59e0b] text-[11px]">
                        +{ev.data.backoff_delay_sec}s
                      </span>
                    )}

                    {ev.data?.status_code && (
                      <span
                        className={`text-[11px] font-medium tabular-nums ${
                          ev.data.status_code < 300 ? 'text-[#4cc38a]' : 'text-[#e5484d]'
                        }`}
                      >
                        HTTP {ev.data.status_code}
                      </span>
                    )}

                    {ev.data?.duration_ms && (
                      <span className="text-[#a3a9b8] text-[11px] tabular-nums">
                        {ev.data.duration_ms} ms
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[#7a8296] text-[11px] tabular-nums">
                    <span>{new Date(ev.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-white/[0.06] text-[11px]">
                    <div className="text-[#7a8296] mb-1">
                      Timestamp: <span className="text-[#a3a9b8]">{ev.timestamp}</span>
                    </div>
                    {ev.data?.error && (
                      <div className="text-[#e5484d] bg-[#e5484d]/10 p-2 rounded border border-[#e5484d]/20 mb-2">
                        {ev.data.error}
                      </div>
                    )}
                    <pre className="p-2.5 rounded bg-[#07080d] text-[#a3a9b8] overflow-x-auto border border-white/[0.06] leading-relaxed">
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
