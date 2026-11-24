import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reliable Webhook Engine | Fault-Tolerant Async Orchestrator',
  description: 'Enterprise async webhook orchestrator with exponential retries, DLQ isolation, and kill -9 recovery proof',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090d16] text-slate-100 antialiased selection:bg-emerald-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
