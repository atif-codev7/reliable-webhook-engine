'use client';

import React from 'react';
import { MetricsSummary } from '../lib/types';
import { Send, Clock, RotateCcw, Check, AlertOctagon, Shield, Zap, Gauge } from 'lucide-react';

interface MetricsOverviewProps {
  metrics: MetricsSummary | null;
}

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({ metrics }) => {
  const primaryStats = [
    {
      label: 'Total dispatched',
      value: (metrics?.total_jobs ?? 0).toLocaleString(),
      icon: Send,
      indicator: null,
    },
    {
      label: 'In-flight processing',
      value: (metrics?.processing ?? 0).toLocaleString(),
      icon: Clock,
      indicator: metrics?.processing ? 'bg-[#f59e0b]' : null,
    },
    {
      label: 'Retrying backoff',
      value: (metrics?.retrying ?? 0).toLocaleString(),
      icon: RotateCcw,
      indicator: metrics?.retrying ? 'bg-[#f59e0b]' : null,
    },
    {
      label: 'Delivered successfully',
      value: (metrics?.completed ?? 0).toLocaleString(),
      icon: Check,
      indicator: metrics?.completed ? 'bg-[#4cc38a]' : null,
    },
  ];

  const diagnosticStats = [
    {
      label: 'Dead letter queue',
      value: metrics?.dlq ?? 0,
      icon: AlertOctagon,
      alert: (metrics?.dlq ?? 0) > 0,
    },
    {
      label: 'Crashes recovered',
      value: metrics?.recovered ?? 0,
      icon: Shield,
      alert: false,
    },
    {
      label: 'Average latency',
      value: `${metrics?.avg_latency_ms ?? 0} ms`,
      icon: Zap,
      alert: false,
    },
    {
      label: 'Delivery success rate',
      value: `${metrics?.success_rate_percent ?? 100}%`,
      icon: Gauge,
      alert: false,
    },
  ];

  return (
    <div className="space-y-3 my-6">
      {/* Primary Flow Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {primaryStats.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className="bg-[#11141c] border border-white/[0.08] rounded-lg p-4 transition-colors duration-150 hover:border-white/[0.14]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#7a8296] font-normal">
                  {item.label}
                </span>
                <div className="flex items-center gap-1.5">
                  {item.indicator && (
                    <span className={`h-1.5 w-1.5 rounded-full ${item.indicator}`} />
                  )}
                  <Icon className="h-3.5 w-3.5 text-[#7a8296]" />
                </div>
              </div>
              <div className="text-2xl font-mono font-medium tracking-tight text-[#eef0f5] tabular-nums">
                {item.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Operational Diagnostic Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-[#0d1017] border border-white/[0.06] rounded-lg">
        {diagnosticStats.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${item.alert ? 'text-[#e5484d]' : 'text-[#7a8296]'}`} />
                <span className="text-xs text-[#7a8296]">{item.label}</span>
              </div>
              <span
                className={`text-xs font-mono font-medium tabular-nums ${
                  item.alert ? 'text-[#e5484d]' : 'text-[#a3a9b8]'
                }`}
              >
                {item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
