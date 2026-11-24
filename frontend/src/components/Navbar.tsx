'use client';

import React from 'react';
import { Activity, Layers, RotateCcw } from 'lucide-react';

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
    <header className="border-b border-white/[0.08] bg-[#07080d] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="h-7 w-7 rounded-md bg-[#1a1e28] border border-white/[0.08] flex items-center justify-center text-[#eef0f5]">
            <Activity className="h-4 w-4 text-[#a3a9b8]" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="font-medium text-[#eef0f5] text-sm tracking-tight">
              Webhook Engine
            </span>
            <span className="text-xs text-[#7a8296] hidden sm:inline">
              asynchronous dispatcher
            </span>
          </div>
        </div>

        {/* Tab Navigation (Segmented control) */}
        <nav className="flex items-center bg-[#11141c] p-1 rounded-lg border border-white/[0.06] text-xs">
          <button
            onClick={() => setActiveTab('stream')}
            className={`h-7 px-3 rounded-md font-medium transition-colors duration-150 ${
              activeTab === 'stream'
                ? 'bg-[#1a1e28] text-[#eef0f5] border border-white/[0.08]'
                : 'text-[#a3a9b8] hover:text-[#eef0f5]'
            }`}
          >
            Live stream
          </button>

          <button
            onClick={() => setActiveTab('dlq')}
            className={`h-7 px-3 rounded-md font-medium transition-colors duration-150 flex items-center gap-1.5 ${
              activeTab === 'dlq'
                ? 'bg-[#1a1e28] text-[#eef0f5] border border-white/[0.08]'
                : 'text-[#a3a9b8] hover:text-[#eef0f5]'
            }`}
          >
            <span>Dead letter queue</span>
            {dlqCount > 0 && (
              <span className="px-1.5 py-0.2 text-[11px] font-mono font-medium rounded bg-[#e5484d]/15 text-[#e5484d] border border-[#e5484d]/25">
                {dlqCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('chaos')}
            className={`h-7 px-3 rounded-md font-medium transition-colors duration-150 ${
              activeTab === 'chaos'
                ? 'bg-[#1a1e28] text-[#eef0f5] border border-white/[0.08]'
                : 'text-[#a3a9b8] hover:text-[#eef0f5]'
            }`}
          >
            Crash recovery
          </button>
        </nav>

        {/* SSE Stream Status Indicator */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-[#11141c] border border-white/[0.08] text-xs">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                sseStatus === 'connected'
                  ? 'bg-[#4cc38a]'
                  : sseStatus === 'connecting'
                  ? 'bg-[#f59e0b]'
                  : 'bg-[#e5484d]'
              }`}
            />
            <span className="font-mono text-[11px] text-[#7a8296] hidden md:inline">
              {sseStatus === 'connected' ? 'telemetry live' : sseStatus}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
