import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Webhook Engine · Fault-Tolerant Asynchronous Dispatcher',
  description: 'Asynchronous webhook delivery engine with exponential retry scheduling, dead-letter queue isolation, and crash recovery.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0b0d14] text-[#eef0f5] antialiased selection:bg-[#252b3a] selection:text-white font-sans">
        {children}
      </body>
    </html>
  );
}
