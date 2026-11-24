'use client';

import React from 'react';
import { Activity, Radio, Cpu, Shield, ExternalLink } from 'lucide-react';

interface NavbarProps {
  sseStatus: 'connected' | 'connecting' | 'disconnected';
  activeTab: string;
  setActiveTab: (tab: string) => void;
  dlqCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  sseStatus,
  activeTab,
  setActiveTab,
  dlqCount,
}) => {
  return (
    <header className="border-b border-slate-800 bg-[#0d1322]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Flagship Label */}
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold shadow-lg shadow-emerald-500/10">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white tracking-wide text-base">
                WEBHOOK ENGINE
              </span>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                PROJ 2: AT-LEAST-ONCE
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              FastAPI Producer → Redis Queue → ARQ Workers → DLQ → Kill-9 Proof
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => setActiveTab('stream')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
              activeTab === 'stream'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Live Stream & Dispatch
          </button>

          <button
            onClick={() => setActiveTab('dlq')}
            className={`relative px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
              activeTab === 'dlq'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            DLQ Inspector
            {dlqCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white">
                {dlqCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('chaos')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
              activeTab === 'chaos'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Kill-9 Proof Lab
          </button>
        </nav>

        {/* Real-time SSE Connection Pill */}
        <div className="flex items-center space-x-2">
          <div
            className={`flex items-center space-x-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
              sseStatus === 'connected'
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                : sseStatus === 'connecting'
                ? 'bg-amber-950/40 border-amber-500/30 text-amber-400'
                : 'bg-rose-950/40 border-rose-500/30 text-rose-400'
            }`}
          >
            <span className="relative flex h-2 w-2">
              {sseStatus === 'connected' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  sseStatus === 'connected'
                    ? 'bg-emerald-500'
                    : sseStatus === 'connecting'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              ></span>
            </span>
            <span className="hidden md:inline uppercase tracking-wider text-[11px]">
              {sseStatus === 'connected' ? 'SSE Live' : sseStatus}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
