import { MetricsSummary, WebhookJob, WorkerNode } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

export async function fetchMetrics(): Promise<MetricsSummary> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
}

export async function fetchJobs(status?: string, limit = 50): Promise<WebhookJob[]> {
  const url = new URL(`${API_BASE}/jobs`);
  if (status) url.searchParams.append('status', status);
  url.searchParams.append('limit', limit.toString());
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return res.json();
}

export async function fetchDLQ(): Promise<WebhookJob[]> {
  const res = await fetch(`${API_BASE}/dlq`);
  if (!res.ok) throw new Error('Failed to fetch DLQ');
  return res.json();
}

export async function retryDLQJob(jobId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/dlq/${jobId}/retry`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to retry DLQ job');
  return res.json();
}

export async function retryAllDLQJobs(): Promise<any> {
  const res = await fetch(`${API_BASE}/dlq/retry-all`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to retry all DLQ jobs');
  return res.json();
}

export async function dispatchWebhook(data: {
  event_type: string;
  destination_url: string;
  payload: any;
  headers?: any;
  idempotency_key?: string;
  max_retries?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/webhooks/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error('Failed to dispatch webhook');
  }
  return res.json();
}

export async function triggerReconciliation(): Promise<any> {
  const res = await fetch(`${API_BASE}/chaos/trigger-reconciliation`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to trigger reconciliation');
  return res.json();
}

export async function simulateWorkerCrash(jobId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/chaos/simulate-worker-crash?job_id=${encodeURIComponent(jobId)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to simulate worker crash');
  return res.json();
}

export async function fetchWorkers(): Promise<WorkerNode[]> {
  const res = await fetch(`${API_BASE}/workers`);
  if (!res.ok) throw new Error('Failed to fetch workers');
  return res.json();
}
