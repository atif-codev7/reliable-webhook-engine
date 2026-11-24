'use client';

import React, { useState } from 'react';
import { dispatchWebhook } from '../lib/api';
import { Send, Zap, RotateCcw, AlertOctagon, Clock, Check, Loader2 } from 'lucide-react';

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
  const [activePreset, setActivePreset] = useState<string>('success');

  const presets = [
    {
      id: 'success',
      name: 'Direct delivery',
      icon: Zap,
      eventType: 'payment.success',
      url: 'http://localhost:8001/api/v1/mock/success',
      description: '200 OK immediate',
    },
    {
      id: 'flaky',
      name: 'Transient failure',
      icon: RotateCcw,
      eventType: 'order.fulfillment',
      url: 'http://localhost:8001/api/v1/mock/flaky?fail_count=2',
      description: '503 retry and recover',
    },
    {
      id: 'fail',
      name: 'Terminal failure',
      icon: AlertOctagon,
      eventType: 'ledger.sync_failed',
      url: 'http://localhost:8001/api/v1/mock/fail-500',
      description: '500 retry exhaustion into DLQ',
    },
    {
      id: 'slow',
      name: 'Delayed response',
      icon: Clock,
      eventType: 'report.export_long',
      url: 'http://localhost:8001/api/v1/mock/slow?delay_seconds=4',
      description: '4s in-flight execution',
    },
  ];

  const applyPreset = (preset: (typeof presets)[0]) => {
    setActivePreset(preset.id);
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
        alert('Invalid JSON syntax in payload');
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
      setIdempotencyKey(`idemp_${Date.now()}`);
      if (onDispatched) onDispatched();
    } catch (err: any) {
      alert(`Dispatch error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#11141c] border border-white/[0.08] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-[#eef0f5]">
            Dispatch test bench
          </h2>
          <p className="text-xs text-[#7a8296] mt-0.5">
            Enqueue tasks to worker queue with idempotency validation
          </p>
        </div>

        {latencyMs !== null && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#4cc38a]/10 border border-[#4cc38a]/20 text-[#4cc38a] text-xs font-mono">
            <Check className="h-3 w-3" />
            <span>202 accepted · {latencyMs} ms</span>
          </div>
        )}
      </div>

      {/* Preset Selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const isSelected = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`p-2.5 rounded-md border text-left transition-colors duration-150 ${
                isSelected
                  ? 'bg-[#1a1e28] border-white/[0.16] text-[#eef0f5]'
                  : 'bg-[#0d1017] border-white/[0.06] text-[#a3a9b8] hover:border-white/[0.10]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium mb-1">
                <Icon className="h-3.5 w-3.5 text-[#7a8296]" />
                <span>{preset.name}</span>
              </div>
              <p className="text-[11px] text-[#7a8296] truncate">{preset.description}</p>
            </button>
          );
        })}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#a3a9b8] mb-1">
              Event type
            </label>
            <input
              type="text"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              required
              className="w-full px-3 py-1.5 text-xs bg-[#0d1017] border border-white/[0.08] rounded-md text-[#eef0f5] font-mono focus:border-white/[0.24] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-[#a3a9b8] mb-1">
              Destination URL
            </label>
            <input
              type="url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              required
              className="w-full px-3 py-1.5 text-xs bg-[#0d1017] border border-white/[0.08] rounded-md text-[#eef0f5] font-mono focus:border-white/[0.24] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-[#a3a9b8] mb-1">
              Idempotency key (deduplication)
            </label>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-[#0d1017] border border-white/[0.08] rounded-md text-[#eef0f5] font-mono focus:border-white/[0.24] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-[#a3a9b8] mb-1">
              Max retries
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxRetries}
              onChange={(e) => setMaxRetries(parseInt(e.target.value) || 5)}
              className="w-full px-3 py-1.5 text-xs bg-[#0d1017] border border-white/[0.08] rounded-md text-[#eef0f5] font-mono focus:border-white/[0.24] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[#a3a9b8] mb-1">
            Payload JSON
          </label>
          <textarea
            rows={3}
            value={payloadStr}
            onChange={(e) => setPayloadStr(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#0d1017] border border-white/[0.08] rounded-md text-[#eef0f5] font-mono focus:border-white/[0.24] focus:outline-none leading-relaxed"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-[#7a8296]">
            Schedule: <span className="font-mono text-[#a3a9b8]">1s · 2s · 4s · 8s · 16s</span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-8 px-4 rounded-md bg-[#eef0f5] hover:bg-white text-[#07080d] font-medium text-xs flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#07080d]" />
            ) : (
              <Send className="h-3.5 w-3.5 text-[#07080d]" />
            )}
            <span>Dispatch webhook</span>
          </button>
        </div>
      </form>
    </div>
  );
};
