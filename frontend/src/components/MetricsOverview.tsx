'use client';

import React from 'react';
import { MetricsSummary } from '../lib/types';
import {
  Send,
  Activity,
  RotateCcw,
  CheckCircle2,
  AlertOctagon,
  ShieldAlert,
  Clock,
  Gauge,
} from 'lucide-react';

interface MetricsOverviewProps {
  metrics: MetricsSummary | null;
}

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({ metrics }) => {
  const cards = [
    {
      label: 'Total Dispatched',
      value: metrics?.total_jobs ?? 0,
      icon: Send,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
    },
    {
      label: 'In-Flight (Processing)',
      value: metrics?.processing ?? 0,
      icon: Activity,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
    },
    {
      label: 'Retrying (Backoff)',
      value: metrics?.retrying ?? 0,
      icon: RotateCcw,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10 border-orange-500/20',
    },
    {
      label: 'Delivered (Success)',
      value: metrics?.completed ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Dead Letter Queue',
      value: metrics?.dlq ?? 0,
      icon: AlertOctagon,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10 border-rose-500/20',
    },
    {
      label: 'Crashes Recovered',
      value: metrics?.recovered ?? 0,
      icon: ShieldAlert,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10 border-purple-500/20',
    },
    {
      label: 'Avg Response Latency',
      value: `${metrics?.avg_latency_ms ?? 0} ms`,
      icon: Clock,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10 border-cyan-500/20',
    },
    {
      label: 'Success Rate',
      value: `${metrics?.success_rate_percent ?? 100}%`,
      icon: Gauge,
      color: 'text-teal-400',
      bgColor: 'bg-teal-500/10 border-teal-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 my-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`p-3.5 rounded-xl border ${card.bgColor} backdrop-blur-sm transition-transform hover:-translate-y-0.5`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
                {card.label}
              </span>
              <Icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <div className="text-xl font-bold tracking-tight text-white">
              {card.value}
            </div>
          </div>
        );
      })}
    </div>
  );
};
