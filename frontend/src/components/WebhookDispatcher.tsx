'use client';

import React, { useState } from 'react';
import { dispatchWebhook } from '../lib/api';
import { Send, Zap, RefreshCw, AlertTriangle, Play, Sparkles, Check } from 'lucide-react';

interface WebhookDispatcherProps {
  onDispatched?: () => void;
}

export const WebhookDispatcher: React.FC<WebhookDispatcherProps> = ({ onDispatched }) => {
  const [eventType, setEventType] = useState('invoice.payment_succeeded');
  const [destinationUrl, setDestinationUrl] = useState('http://localhost:8001/api/v1/mock/success');
  const [payloadStr, setPayloadStr] = useState(
    JSON.stringify(
      {
        customer_id: 'cust_984712',
        amount: 25000,
        currency: 'USD',
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  const [idempotencyKey, setIdempotencyKey] = useState(`idemp_${Date.now()}`);
  const [maxRetries, setMaxRetries] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const presets = [
    {
      name: 'Instant Success (200 OK)',
      icon: Zap,
      eventType: 'payment.success',
      url: 'http://localhost:8001/api/v1/mock/success',
      color: 'border-emerald-500/30 hover:border-emerald-500 text-emerald-400 bg-emerald-950/20',
      description: 'Immediate 200 OK delivery',
    },
    {
      name: 'Flaky Service (Backoff Demo)',
      icon: RefreshCw,
      eventType: 'order.fulfillment',
      url: 'http://localhost:8001/api/v1/mock/flaky?fail_count=2',
      color: 'border-amber-500/30 hover:border-amber-500 text-amber-400 bg-amber-950/20',
      description: 'Fails 2x with 503, succeeds on 3rd attempt',
    },
    {
      name: 'Fatal Outage (DLQ Exhaustion)',
      icon: AlertTriangle,
      eventType: 'ledger.sync_failed',
      url: 'http://localhost:8001/api/v1/mock/fail-500',
      color: 'border-rose-500/30 hover:border-rose-500 text-rose-400 bg-rose-950/20',
      description: 'Persistent 500 error, walks 1s->2s->4s->8s->16s into DLQ',
    },
    {
      name: 'Slow Endpoint (In-Flight)',
      icon: Play,
      eventType: 'report.export_long',
      url: 'http://localhost:8001/api/v1/mock/slow?delay_seconds=4',
      color: 'border-blue-500/30 hover:border-blue-500 text-blue-400 bg-blue-950/20',
      description: '4s latency for observing in-flight processing',
    },
  ];

  const applyPreset = (preset: (typeof presets)[0]) => {
    setEventType(preset.eventType);
    setDestinationUrl(preset.url);
    setIdempotencyKey(`idemp_${preset.eventType}_${Date.now().toString().slice(-6)}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLastResponse(null);
    setLatencyMs(null);

    const start = performance.now();
    try {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(payloadStr);
      } catch (err) {
        alert('Invalid JSON in payload');
        setIsSubmitting(false);
        return;
      }

      const res = await dispatchWebhook({
        event_type: eventType,
        destination_url: destinationUrl,
        payload: parsedPayload,
        idempotency_key: idempotencyKey || undefined,
        max_retries: maxRetries,
      });

      const duration = Math.round(performance.now() - start);
      setLatencyMs(duration);
      setLastResponse(res);
      // Auto-generate fresh idempotency key for next run
      setIdempotencyKey(`idemp_${Date.now()}`);
      if (onDispatched) onDispatched();
    } catch (err: any) {
      alert(`Dispatch failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#0f172a]/70 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-400" />
            High-Throughput Webhook Producer
          </h2>
          <p className="text-xs text-slate-400">
            Returns <span className="text-emerald-400 font-mono">202 Accepted</span> in &lt;20ms and enqueues to Redis
          </p>
        </div>

        {latencyMs !== null && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
            <Check className="h-3.5 w-3.5" />
            <span>202 Accepted in {latencyMs} ms</span>
          </div>
        )}
      </div>

      {/* Preset Quick Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        {presets.map((preset, i) => {
          const Icon = preset.icon;
          return (
            <button
              key={i}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`p-3 rounded-xl border text-left transition-all ${preset.color}`}
            >
              <div className="flex items-center gap-2 font-medium text-xs mb-1">
                <Icon className="h-3.5 w-3.5" />
                <span>{preset.name}</span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-1">{preset.description}</p>
            </button>
          );
        })}
      </div>

      {/* Dispatch Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Event Type
            </label>
            <input
              type="text"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Destination URL
            </label>
            <input
              type="url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Idempotency Key (Optional deduplication)
            </label>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Max Retries (DLQ Threshold)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxRetries}
              onChange={(e) => setMaxRetries(parseInt(e.target.value) || 5)}
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            JSON Webhook Payload
          </label>
          <textarea
            rows={3}
            value={payloadStr}
            onChange={(e) => setPayloadStr(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-[11px] text-slate-400">
            Backoff: <span className="font-mono text-slate-300">1s → 2s → 4s → 8s → 16s</span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            {isSubmitting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span>Dispatch Webhook (202 Accepted)</span>
          </button>
        </div>
      </form>
    </div>
  );
};
