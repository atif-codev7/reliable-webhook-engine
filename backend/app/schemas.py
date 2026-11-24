from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, HttpUrl, ConfigDict

class WebhookDispatchInput(BaseModel):
    event_type: str = Field(default="invoice.paid", description="Type of event triggering webhook")
    destination_url: str = Field(..., description="Target endpoint for webhook delivery")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Arbitrary JSON payload")
    headers: Optional[Dict[str, str]] = Field(default=None, description="Custom headers for the POST request")
    idempotency_key: Optional[str] = Field(default=None, description="Client-generated key to prevent duplicate dispatches")
    max_retries: Optional[int] = Field(default=5, ge=1, le=10, description="Maximum retry attempts before DLQ")

class WebhookAcceptedResponse(BaseModel):
    job_id: str
    status: str
    event_type: str
    destination_url: str
    idempotency_key: Optional[str] = None
    created_at: datetime
    message: str = "Webhook accepted for reliable background delivery"

class JobAttemptSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    attempt_number: int
    status_code: Optional[int] = None
    response_body: Optional[str] = None
    error_message: Optional[str] = None
    duration_ms: Optional[float] = None
    attempted_at: datetime

class JobDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    idempotency_key: Optional[str] = None
    event_type: str
    destination_url: str
    payload: Any
    headers: Optional[Any] = None
    status: str
    attempts: int
    max_retries: int
    backoff_delay: float
    locked_by: Optional[str] = None
    lease_expires_at: Optional[datetime] = None
    next_retry_at: Optional[datetime] = None
    last_status_code: Optional[int] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    attempts_history: List[JobAttemptSchema] = []

class DLQItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    idempotency_key: Optional[str] = None
    event_type: str
    destination_url: str
    payload: Any
    attempts: int
    max_retries: int
    last_status_code: Optional[int] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    attempts_history: List[JobAttemptSchema] = []

class WorkerNodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    worker_id: str
    hostname: str
    pid: Optional[int] = None
    status: str
    current_job_id: Optional[str] = None
    last_heartbeat: datetime
    tasks_completed: int
    tasks_failed: int
    started_at: datetime

class MetricsSummary(BaseModel):
    total_jobs: int
    queued: int
    processing: int
    retrying: int
    completed: int
    dlq: int
    recovered: int
    active_workers: int
    avg_latency_ms: float
    success_rate_percent: float

class EventMessage(BaseModel):
    type: str
    timestamp: datetime
    job_id: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)
