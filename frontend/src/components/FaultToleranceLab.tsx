'use client';

import React, { useState } from 'react';
import { dispatchWebhook, simulateWorkerCrash, triggerReconciliation } from '../lib/api';
import {
  Shield,
  RotateCcw,
  Zap,
  Check,
  Terminal,
  Loader2,
  Cpu,
  PowerOff,
} from 'lucide-react';

interface FaultToleranceLabProps {
  onEventTriggered?: () => void;
}

export const FaultToleranceLab: React.FC<FaultToleranceLabProps> = ({ onEventTriggered }) => {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setSimulationLogs((prev) => [`[${time}] ${msg}`, ...prev]);
  };

  // Step 1: Dispatch Job
  const handleStep1 = async () => {
    setIsProcessing(true);
    try {
      addLog('Dispatching in-flight task with 6s latency target...');
      const res = await dispatchWebhook({
        event_type: 'settlement.reconciliation',
        destination_url: 'http://localhost:8001/api/v1/mock/slow?delay_seconds=6',
        payload: { test_type: 'kill-9-recovery', initiated_at: new Date().toISOString() },
        max_retries: 5,
      });
      setActiveJobId(res.job_id);
      addLog(`Task ${res.job_id.slice(0, 8)} accepted and locked with 10s lease duration`);
      setStep(2);
      if (onEventTriggered) onEventTriggered();
    } catch (err: any) {
      addLog(`Task creation error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Simulate kill -9 crash
  const handleStep2 = async () => {
    if (!activeJobId) return;
    setIsProcessing(true);
    try {
      addLog(`Simulating sudden worker termination (SIGKILL) on task ${activeJobId.slice(0, 8)}...`);
      const res = await simulateWorkerCrash(activeJobId);
      addLog(`Worker ${res.worker} terminated abruptly. Lease heartbeat halted.`);
      addLog(`Task remains in processing state with expired lease.`);
      setStep(3);
      if (onEventTriggered) onEventTriggered();
    } catch (err: any) {
      addLog(`Simulation error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 3: Trigger Watchdog Reconciliation
  const handleStep3 = async () => {
    setIsProcessing(true);
    try {
      addLog('Running watchdog reconciliation cycle...');
      const res = await triggerReconciliation();
      if (res.recovered_count > 0) {
        addLog(`Watchdog cycle complete: ${res.recovered_count} expired lease reclaimed.`);
        addLog(`Crash audit appended to attempt log. Task re-enqueued to active fleet.`);
      } else {
        addLog('Watchdog cycle complete: no expired leases detected.');
      }
      setStep(1);
      setActiveJobId(null);
      if (onEventTriggered) onEventTriggered();
    } catch (err: any) {
      addLog(`Reconciliation error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-[#11141c] border border-white/[0.08] rounded-lg p-5 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-sm font-medium text-[#eef0f5] flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#a3a9b8]" />
          <span>Crash recovery verification</span>
        </h2>
        <p className="text-xs text-[#7a8296] mt-0.5">
          Guaranteed at-least-once delivery under abrupt process termination (SIGKILL / kill -9)
        </p>
      </div>

      {/* Architectural Principles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 p-3 rounded-md bg-[#0d1017] border border-white/[0.04] text-xs">
        <div className="p-2.5 rounded bg-[#11141c] border border-white/[0.04] space-y-1">
          <div className="text-[#eef0f5] font-medium flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-[#7a8296]" />
            <span>1. Distributed lease</span>
          </div>
          <p className="text-[#7a8296] text-[11px] leading-relaxed">
            Worker locks task with 10s lease duration, renewed every 3s while active.
          </p>
        </div>

        <div className="p-2.5 rounded bg-[#11141c] border border-white/[0.04] space-y-1">
          <div className="text-[#eef0f5] font-medium flex items-center gap-1.5">
            <PowerOff className="h-3.5 w-3.5 text-[#7a8296]" />
            <span>2. Process failure</span>
          </div>
          <p className="text-[#7a8296] text-[11px] leading-relaxed">
            SIGKILL terminates worker. No cleanup hooks execute; lease expires.
          </p>
        </div>

        <div className="p-2.5 rounded bg-[#11141c] border border-white/[0.04] space-y-1">
          <div className="text-[#eef0f5] font-medium flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5 text-[#7a8296]" />
            <span>3. Reconciliation</span>
          </div>
          <p className="text-[#7a8296] text-[11px] leading-relaxed">
            Watchdog detects expired lease, records audit trail, and safely re-enqueues.
          </p>
        </div>
      </div>

      {/* Interactive Step Controls */}
      <div className="space-y-2">
        <span className="text-xs text-[#7a8296]">
          Demonstration sequence
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Step 1 */}
          <button
            onClick={handleStep1}
            disabled={isProcessing || step !== 1}
            className={`p-3 rounded-md border text-left transition-colors duration-150 ${
              step === 1
                ? 'border-white/[0.20] bg-[#1a1e28] text-[#eef0f5]'
                : 'border-white/[0.04] bg-[#0d1017] text-[#7a8296] opacity-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-[#a3a9b8]">Step 1</span>
              <Zap className="h-3.5 w-3.5 text-[#7a8296]" />
            </div>
            <div className="text-xs font-medium text-[#eef0f5]">Enqueue active task</div>
            <div className="text-[11px] text-[#7a8296] mt-0.5">Start in-flight execution</div>
          </button>

          {/* Step 2 */}
          <button
            onClick={handleStep2}
            disabled={isProcessing || step !== 2}
            className={`p-3 rounded-md border text-left transition-colors duration-150 ${
              step === 2
                ? 'border-[#e5484d]/30 bg-[#e5484d]/10 text-[#eef0f5]'
                : 'border-white/[0.04] bg-[#0d1017] text-[#7a8296] opacity-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-[#e5484d]">Step 2</span>
              <PowerOff className="h-3.5 w-3.5 text-[#e5484d]" />
            </div>
            <div className="text-xs font-medium text-[#eef0f5]">Terminate worker</div>
            <div className="text-[11px] text-[#7a8296] mt-0.5">Simulate SIGKILL mid-task</div>
          </button>

          {/* Step 3 */}
          <button
            onClick={handleStep3}
            disabled={isProcessing || step !== 3}
            className={`p-3 rounded-md border text-left transition-colors duration-150 ${
              step === 3
                ? 'border-white/[0.20] bg-[#1a1e28] text-[#eef0f5]'
                : 'border-white/[0.04] bg-[#0d1017] text-[#7a8296] opacity-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-[#a3a9b8]">Step 3</span>
              <RotateCcw className="h-3.5 w-3.5 text-[#7a8296]" />
            </div>
            <div className="text-xs font-medium text-[#eef0f5]">Execute reconciler</div>
            <div className="text-[11px] text-[#7a8296] mt-0.5">Reclaim lease & re-queue</div>
          </button>
        </div>
      </div>

      {/* Terminal Telemetry Log */}
      <div className="rounded-md bg-[#07080d] border border-white/[0.06] p-3 font-mono text-xs space-y-2">
        <div className="flex items-center justify-between text-[#7a8296] border-b border-white/[0.06] pb-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5" />
            <span>Reconciliation telemetry</span>
          </div>
          {simulationLogs.length > 0 && (
            <button
              onClick={() => setSimulationLogs([])}
              className="text-[11px] text-[#7a8296] hover:text-[#a3a9b8]"
            >
              Clear
            </button>
          )}
        </div>

        <div className="max-h-44 overflow-y-auto space-y-1 pt-1 text-[11px] leading-relaxed">
          {simulationLogs.length === 0 ? (
            <div className="text-[#7a8296]">
              Awaiting verification execution. Click Step 1 to begin.
            </div>
          ) : (
            simulationLogs.map((log, i) => (
              <div
                key={i}
                className={
                  log.includes('terminated')
                    ? 'text-[#e5484d]'
                    : log.includes('reclaimed') || log.includes('complete')
                    ? 'text-[#4cc38a]'
                    : 'text-[#a3a9b8]'
                }
              >
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
