'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '../components/Navbar';
import { MetricsOverview } from '../components/MetricsOverview';
import { WebhookDispatcher } from '../components/WebhookDispatcher';
import { LiveStreamFeed } from '../components/LiveStreamFeed';
import { DLQInspector } from '../components/DLQInspector';
import { FaultToleranceLab } from '../components/FaultToleranceLab';
import { MetricsSummary, SSEEvent, WebhookJob } from '../lib/types';
import { fetchMetrics, fetchDLQ } from '../lib/api';

const SSE_URL = process.env.NEXT_PUBLIC_SSE_URL || 'http://localhost:8001/api/v1/events/stream';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<string>('stream');
  const [sseStatus, setSseStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [dlqJobs, setDlqJobs] = useState<WebhookJob[]>([]);

  // Refresh metrics and DLQ
  const refreshData = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([
        fetchMetrics().catch(() => null),
        fetchDLQ().catch(() => []),
      ]);
      if (m) setMetrics(m);
      if (d) setDlqJobs(d);
    } catch (err) {
      console.error('Failed to refresh data', err);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Connect to SSE Stream
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      setSseStatus('connecting');
      try {
        eventSource = new EventSource(SSE_URL);

        eventSource.onopen = () => {
          setSseStatus('connected');
        };

        eventSource.onmessage = (event) => {
          try {
            const parsed: SSEEvent = JSON.parse(event.data);
            setEvents((prev) => [parsed, ...prev.slice(0, 199)]);
            refreshData();
          } catch (e) {
            console.error('Error parsing SSE event:', e);
          }
        };

        eventSource.onerror = () => {
          setSseStatus('disconnected');
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          reconnectTimeout = setTimeout(connectSSE, 3000);
        };
      } catch (e) {
        setSseStatus('disconnected');
        reconnectTimeout = setTimeout(connectSSE, 4000);
      }
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [refreshData]);

  return (
    <div className="min-h-screen bg-[#0b0d14] text-[#eef0f5] flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        sseStatus={sseStatus}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        dlqCount={dlqJobs.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* KPI Bar */}
        <MetricsOverview metrics={metrics} />

        {/* Tab 1: Live Stream & Dispatcher */}
        {activeTab === 'stream' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 space-y-5">
              <WebhookDispatcher onDispatched={refreshData} />
            </div>
            <div className="lg:col-span-6">
              <LiveStreamFeed
                events={events}
                onClear={() => setEvents([])}
                sseStatus={sseStatus}
              />
            </div>
          </div>
        )}

        {/* Tab 2: DLQ Inspector */}
        {activeTab === 'dlq' && (
          <DLQInspector dlqJobs={dlqJobs} onRefresh={refreshData} />
        )}

        {/* Tab 3: Kill-9 Proof Lab */}
        {activeTab === 'chaos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7">
              <FaultToleranceLab onEventTriggered={refreshData} />
            </div>
            <div className="lg:col-span-5">
              <LiveStreamFeed
                events={events}
                onClear={() => setEvents([])}
                sseStatus={sseStatus}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-[#07080d] py-3.5 text-center text-xs text-[#7a8296] font-mono">
        Webhook Engine · At-least-once delivery with deterministic lease reconciliation
      </footer>
    </div>
  );
}
