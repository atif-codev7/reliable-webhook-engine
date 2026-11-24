export interface JobAttempt {
  id: string;
  attempt_number: number;
  status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number | null;
  attempted_at: string;
}

export interface WebhookJob {
  id: string;
  idempotency_key: string | null;
  event_type: string;
  destination_url: string;
  payload: any;
  headers: any | null;
  status: 'QUEUED' | 'PROCESSING' | 'RETRYING' | 'COMPLETED' | 'DLQ' | 'RECOVERED';
  attempts: number;
  max_retries: number;
  backoff_delay: number;
  locked_by: string | null;
  lease_expires_at: string | null;
  next_retry_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  attempts_history: JobAttempt[];
}

export interface MetricsSummary {
  total_jobs: number;
  queued: number;
  processing: number;
  retrying: number;
  completed: number;
  dlq: number;
  recovered: number;
  active_workers: number;
  avg_latency_ms: number;
  success_rate_percent: number;
}

export interface SSEEvent {
  type: string;
  timestamp: string;
  job_id?: string;
  data: Record<string, any>;
}

export interface WorkerNode {
  worker_id: string;
  hostname: string;
  pid: number | null;
  status: string;
  current_job_id: string | null;
  last_heartbeat: string;
  tasks_completed: number;
  tasks_failed: number;
  started_at: string;
}
