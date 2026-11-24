'use client';

import React, { useState } from 'react';
import { dispatchWebhook, simulateWorkerCrash, triggerReconciliation } from '../lib/api';
import {
  ShieldAlert,
  Skull,
  RotateCcw,
  Zap,
  CheckCircle2,
  ArrowRight,
  Cpu,
  RefreshCw,
  Terminal,
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
    const time = new Date().toLocaleTimeString();
    setSimulationLogs((prev) => [`[${time}] ${msg}`, ...prev]);
  };

  // Step 1: Dispatch Job
  const handleStep1 = async () => {
    setIsProcessing(true);
    try {
      addLog('Dispatching slow webhook to simulate in-flight execution...');
      const res = await dispatchWebhook({
        event_type: 'chaos.test_job',
        destination_url: 'http://localhost:8001/api/v1/mock/slow?delay_seconds=6',
        payload: { test_type: 'kill-9-recovery-proof', initiated_at: new Date().toISOString() },
        max_retries: 5,
      });
      setActiveJobId(res.job_id);
      addLog(`Job created: ${res.job_id.slice(0, 8)}... Status: 202 Accepted & QUEUED`);
      setStep(2);
      if (onEventTriggered) onEventTriggered();
    } catch (err: any) {
      addLog(`Error creating job: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Simulate kill -9 crash
  const handleStep2 = async () => {
    if (!activeJobId) return;
    setIsProcessing(true);
    try {
      addLog(`Sending simulated SIGKILL (kill -9) to worker holding job ${activeJobId.slice(0, 8)}...`);
      const res = await simulateWorkerCrash(activeJobId);
      addLog(`WORKER CRASHED: ${res.worker}. Process terminated immediately with 0 cleanup.`);
      addLog(`Job ${activeJobId.slice(0, 8)}... is now stranded in PROCESSING with expired lease!`);
      setStep(3);
      if (onEventTriggered) onEventTriggered();
    } catch (err: any) {
      addLog(`Error simulating crash: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 3: Trigger Watchdog Reconciliation
  const handleStep3 = async () => {
    setIsProcessing(true);
    try {
      addLog('Watchdog Reconciler running periodic scan for expired leases...');
      const res = await triggerReconciliation();
      if (res.recovered_count > 0) {
        addLog(`SUCCESS! Watchdog detected ${res.recovered_count} orphaned job(s) from crashed workers.`);
        addLog(`Lease reclaimed, crash audit logged, and task safely re-enqueued to worker fleet!`);
        addLog(`Zero dropped tasks. Zero zombie states. At-least-once delivery GUARANTEED.`);
      } else {
        addLog('Watchdog scan completed: No orphaned jobs found.');
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
    <div className="bg-[#0f172a]/70 border border-slate-800 rounded-2xl p-6 backdrop-blur-md space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              Fault-Tolerance Lab: <span className="text-purple-400 font-mono">kill -9</span> Recovery Proof
            </h2>
            <p className="text-xs text-slate-400">
              Demonstrating lease heartbeats & watchdog zombie reconciliation under sudden process death
            </p>
          </div>
        </div>
      </div>

      {/* Architectural Diagram */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
          <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5" />
            1. Distributed Lease Lock
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Worker claims task with <code className="text-slate-300">lease_expires_at = now() + 10s</code>.
            A background coroutine renews this lease every 3s during active execution.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
          <div className="text-rose-400 font-semibold flex items-center gap-1.5">
            <Skull className="h-3.5 w-3.5" />
            2. Sudden Worker Death (kill -9)
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Worker process killed by OOM or SIGKILL. No cleanup or finally block runs.
            Heartbeat halts, allowing lease expiration to trigger.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
          <div className="text-purple-400 font-semibold flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            3. Watchdog Reconciliation
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Reconciler scans for <code className="text-slate-300">PROCESSING && lease_expired</code>,
            reclaims lock, logs crash audit, and re-enqueues without dropping the task.
          </p>
        </div>
      </div>

      {/* Interactive Step-by-Step Simulator */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Interactive Live Demonstration
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Step 1 Button */}
          <button
            onClick={handleStep1}
            disabled={isProcessing || step !== 1}
            className={`p-3 rounded-xl border text-left transition-all ${
              step === 1
                ? 'border-emerald-500 bg-emerald-950/30 text-white shadow-lg shadow-emerald-500/10'
                : 'border-slate-800 bg-slate-900/40 text-slate-500 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-xs text-emerald-400">Step 1</span>
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="text-xs font-medium text-slate-200">Dispatch Task</div>
            <div className="text-[10px] text-slate-400 mt-1">Start slow in-flight webhook</div>
          </button>

          {/* Step 2 Button */}
          <button
            onClick={handleStep2}
            disabled={isProcessing || step !== 2}
            className={`p-3 rounded-xl border text-left transition-all ${
              step === 2
                ? 'border-rose-500 bg-rose-950/30 text-white shadow-lg shadow-rose-500/10 animate-pulse-subtle'
                : 'border-slate-800 bg-slate-900/40 text-slate-500 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-xs text-rose-400">Step 2</span>
              <Skull className="h-3.5 w-3.5 text-rose-400" />
            </div>
            <div className="text-xs font-medium text-slate-200">Simulate kill -9</div>
            <div className="text-[10px] text-slate-400 mt-1">Kill worker process mid-execution</div>
          </button>

          {/* Step 3 Button */}
          <button
            onClick={handleStep3}
            disabled={isProcessing || step !== 3}
            className={`p-3 rounded-xl border text-left transition-all ${
              step === 3
                ? 'border-purple-500 bg-purple-950/30 text-white shadow-lg shadow-purple-500/10'
                : 'border-slate-800 bg-slate-900/40 text-slate-500 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-xs text-purple-400">Step 3</span>
              <RotateCcw className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <div className="text-xs font-medium text-slate-200">Watchdog Recovery</div>
            <div className="text-[10px] text-slate-400 mt-1">Reclaim lease & re-enqueue</div>
          </button>
        </div>
      </div>

      {/* Terminal Live Simulation Log */}
      <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs space-y-2">
        <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-emerald-400" />
            <span>Chaos Proof Event Log</span>
          </div>
          {simulationLogs.length > 0 && (
            <button
              onClick={() => setSimulationLogs([])}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>

        <div className="max-h-48 overflow-y-auto space-y-1.5 pt-1 text-[11px]">
          {simulationLogs.length === 0 ? (
            <div className="text-slate-600">
              Run Step 1 to trigger the in-flight task and observe the kill -9 recovery proof.
            </div>
          ) : (
            simulationLogs.map((log, i) => (
              <div
                key={i}
                className={
                  log.includes('CRASHED') || log.includes('SIGKILL')
                    ? 'text-rose-400'
                    : log.includes('SUCCESS') || log.includes('reclaimed')
                    ? 'text-emerald-400 font-semibold'
                    : 'text-slate-300'
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
