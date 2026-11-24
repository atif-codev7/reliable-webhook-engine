import asyncio
import json
from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, delete

from backend.app.config import settings
from backend.app.database import init_db, get_db
from backend.app.models import WebhookJob, JobAttempt, WorkerNode
from backend.app.schemas import (
    WebhookDispatchInput,
    WebhookAcceptedResponse,
    JobDetailResponse,
    DLQItemResponse,
    MetricsSummary,
    WorkerNodeResponse,
)
from backend.app.producer import dispatch_webhook
from backend.app.events import event_bus
from backend.app.watchdog import watchdog_service, reconcile_orphaned_jobs
from backend.app.mock_server import router as mock_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[Engine] Initializing database...")
    await init_db()
    print("[Engine] Initializing real-time event bus...")
    await event_bus.init_redis()
    print("[Engine] Starting Watchdog Reconciler...")
    await watchdog_service.start()
    yield
    # Shutdown
    print("[Engine] Shutting down...")
    await watchdog_service.stop()
    await event_bus.close()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="High-Throughput, Fault-Tolerant Webhook & Asynchronous Job Engine with ARQ, DLQ, and Kill-9 Proof",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Mock Webhook Targets
app.include_router(mock_router, prefix=settings.API_V1_STR)

# -------------------------------------------------------------
# 1. Producer Endpoint (202 Accepted High-Throughput)
# -------------------------------------------------------------
@app.post(
    f"{settings.API_V1_STR}/webhooks/dispatch",
    response_model=WebhookAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Producer"]
)
async def dispatch_webhook_endpoint(
    payload_in: WebhookDispatchInput,
    db: AsyncSession = Depends(get_db)
):
    """
    High-throughput webhook dispatch endpoint.
    Validates payload, commits to database, enqueues to ARQ worker queue,
    broadcasts SSE event, and returns 202 Accepted immediately (<20ms).
    """
    return await dispatch_webhook(payload_in, db)

# -------------------------------------------------------------
# 2. Real-Time Server-Sent Events (SSE) Delivery Stream
# -------------------------------------------------------------
@app.get(f"{settings.API_V1_STR}/events/stream", tags=["Real-Time Stream"])
async def stream_events():
    """
    Server-Sent Events (SSE) connection streaming real-time job lifecycle transitions:
    JOB_DISPATCHED, JOB_PROCESSING, JOB_RETRY_SCHEDULED, JOB_COMPLETED,
    JOB_DEAD_LETTERED, JOB_RECOVERED_FROM_CRASH, and WORKER_HEARTBEAT.
    """
    queue = await event_bus.register()

    async def event_generator():
        try:
            # Send initial handshake event
            init_msg = {
                "type": "STREAM_CONNECTED",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": {"message": "Connected to Reliable Webhook Engine Real-time SSE Stream"}
            }
            yield f"event: message\ndata: {json.dumps(init_msg)}\n\n"

            while True:
                try:
                    # Wait for next event with a 15-second keepalive timeout
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"event: message\ndata: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Send comment ping to keep HTTP connection alive
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            event_bus.unregister(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        }
    )

# -------------------------------------------------------------
# 3. Job Inspection Endpoints
# -------------------------------------------------------------
@app.get(f"{settings.API_V1_STR}/jobs", response_model=List[JobDetailResponse], tags=["Jobs"])
async def list_jobs(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(WebhookJob).order_by(desc(WebhookJob.created_at)).offset(offset).limit(limit)
    if status_filter:
        stmt = stmt.where(WebhookJob.status == status_filter.upper())
    result = await db.execute(stmt)
    jobs = result.scalars().all()
    return jobs

@app.get(f"{settings.API_V1_STR}/jobs/{{job_id}}", response_model=JobDetailResponse, tags=["Jobs"])
async def get_job_detail(
    job_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(WebhookJob).where(WebhookJob.id == job_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Webhook job not found")
    return job

# -------------------------------------------------------------
# 4. Dead Letter Queue (DLQ) Management
# -------------------------------------------------------------
@app.get(f"{settings.API_V1_STR}/dlq", response_model=List[DLQItemResponse], tags=["Dead Letter Queue"])
async def get_dlq_jobs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve all jobs currently in Dead Letter Queue (DLQ)."""
    stmt = (
        select(WebhookJob)
        .where(WebhookJob.status == "DLQ")
        .order_by(desc(WebhookJob.updated_at))
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

@app.post(f"{settings.API_V1_STR}/dlq/{{job_id}}/retry", tags=["Dead Letter Queue"])
async def retry_dlq_job(
    job_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Manually re-trigger a dead-lettered job."""
    stmt = select(WebhookJob).where(WebhookJob.id == job_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "DLQ":
        raise HTTPException(status_code=400, detail=f"Job is not in DLQ (current status: {job.status})")

    # Reset job state
    job.status = "QUEUED"
    job.attempts = 0
    job.backoff_delay = settings.BACKOFF_BASE_SECONDS
    job.next_retry_at = None
    job.last_error = None
    job.locked_by = None
    job.lease_expires_at = None
    job.updated_at = datetime.now(timezone.utc)
    await db.commit()

    # Re-enqueue
    from backend.app.producer import get_redis_pool
    pool = await get_redis_pool()
    if pool:
        await pool.enqueue_job("deliver_webhook", job.id, _queue_name=settings.ARQ_QUEUE_NAME)
    else:
        from backend.app.worker import execute_webhook_job_in_memory
        asyncio.create_task(execute_webhook_job_in_memory(job.id))

    await event_bus.publish(
        event_type="DLQ_MANUAL_RETRY",
        job_id=job.id,
        data={"message": "Job manually re-triggered from DLQ", "destination_url": job.destination_url}
    )

    return {"message": "Job successfully requeued from DLQ", "job_id": job.id, "status": "QUEUED"}

@app.post(f"{settings.API_V1_STR}/dlq/retry-all", tags=["Dead Letter Queue"])
async def retry_all_dlq_jobs(db: AsyncSession = Depends(get_db)):
    """Batch re-trigger all jobs in DLQ."""
    stmt = select(WebhookJob).where(WebhookJob.status == "DLQ")
    result = await db.execute(stmt)
    dlq_jobs = result.scalars().all()

    count = 0
    for job in dlq_jobs:
        job.status = "QUEUED"
        job.attempts = 0
        job.backoff_delay = settings.BACKOFF_BASE_SECONDS
        job.next_retry_at = None
        job.last_error = None
        job.locked_by = None
        job.lease_expires_at = None
        job.updated_at = datetime.now(timezone.utc)
        count += 1

    await db.commit()

    from backend.app.producer import get_redis_pool
    pool = await get_redis_pool()
    for job in dlq_jobs:
        if pool:
            await pool.enqueue_job("deliver_webhook", job.id, _queue_name=settings.ARQ_QUEUE_NAME)
        else:
            from backend.app.worker import execute_webhook_job_in_memory
            asyncio.create_task(execute_webhook_job_in_memory(job.id))

    await event_bus.publish(
        event_type="DLQ_BATCH_RETRY",
        data={"requeued_count": count}
    )

    return {"message": f"Successfully requeued {count} jobs from DLQ", "count": count}

# -------------------------------------------------------------
# 5. Live Metrics & Worker Telemetry
# -------------------------------------------------------------
@app.get(f"{settings.API_V1_STR}/stats", response_model=MetricsSummary, tags=["Telemetry"])
async def get_metrics_summary(db: AsyncSession = Depends(get_db)):
    """Live engine metrics and status breakdowns."""
    # Counts by status
    status_counts_stmt = select(WebhookJob.status, func.count(WebhookJob.id)).group_by(WebhookJob.status)
    res = await db.execute(status_counts_stmt)
    status_map = dict(res.all())

    queued = status_map.get("QUEUED", 0)
    processing = status_map.get("PROCESSING", 0)
    retrying = status_map.get("RETRYING", 0)
    completed = status_map.get("COMPLETED", 0)
    dlq = status_map.get("DLQ", 0)
    total = sum(status_map.values())

    # Average latency of completed attempts
    avg_latency_stmt = select(func.avg(JobAttempt.duration_ms)).where(JobAttempt.status_code == 200)
    res_lat = await db.execute(avg_latency_stmt)
    avg_lat = res_lat.scalar() or 0.0

    # Recovered count from attempt error logs
    recovered_stmt = select(func.count(JobAttempt.id)).where(JobAttempt.error_message.like("%CRASH DETECTED%"))
    res_rec = await db.execute(recovered_stmt)
    recovered_count = res_rec.scalar() or 0

    # Active workers
    active_workers_stmt = select(func.count(WorkerNode.worker_id)).where(WorkerNode.status == "ACTIVE")
    res_workers = await db.execute(active_workers_stmt)
    active_workers = res_workers.scalar() or 1

    success_rate = (completed / total * 100.0) if total > 0 else 100.0

    return MetricsSummary(
        total_jobs=total,
        queued=queued,
        processing=processing,
        retrying=retrying,
        completed=completed,
        dlq=dlq,
        recovered=recovered_count,
        active_workers=active_workers,
        avg_latency_ms=round(avg_lat, 2),
        success_rate_percent=round(success_rate, 1)
    )

@app.get(f"{settings.API_V1_STR}/workers", response_model=List[WorkerNodeResponse], tags=["Telemetry"])
async def list_workers(db: AsyncSession = Depends(get_db)):
    stmt = select(WorkerNode).order_by(desc(WorkerNode.last_heartbeat))
    res = await db.execute(stmt)
    return res.scalars().all()

# -------------------------------------------------------------
# 6. Fault-Tolerance & Chaos Bench
# -------------------------------------------------------------
@app.post(f"{settings.API_V1_STR}/chaos/trigger-reconciliation", tags=["Chaos Bench"])
async def trigger_reconciliation():
    """Immediately triggers the watchdog reconciler to recover any zombie or crashed jobs."""
    recovered = await reconcile_orphaned_jobs()
    return {
        "status": "success",
        "recovered_count": len(recovered),
        "recovered_jobs": recovered
    }

@app.post(f"{settings.API_V1_STR}/chaos/simulate-worker-crash", tags=["Chaos Bench"])
async def simulate_worker_crash(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Simulates a worker dying abruptly mid-execution (SIGKILL / kill -9):
    Manually places the job in 'PROCESSING' with an already expired lease,
    simulating that the worker process vanished without releasing its lock.
    """
    stmt = select(WebhookJob).where(WebhookJob.id == job_id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    from datetime import timedelta
    # Simulate worker crash: lease expired 5 seconds ago
    job.status = "PROCESSING"
    job.locked_by = "worker-simulated-crash-pid-9999"
    job.locked_at = datetime.now(timezone.utc) - timedelta(seconds=15)
    job.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=5)
    await db.commit()

    await event_bus.publish(
        event_type="CHAOS_WORKER_KILLED_SIMULATION",
        job_id=job.id,
        data={
            "killed_worker": "worker-simulated-crash-pid-9999",
            "message": "Simulated kill -9 on worker. Job left stranded in PROCESSING with expired lease."
        }
    )

    return {
        "message": "Simulated kill -9 on worker. Watchdog will detect and recover this job on its next tick.",
        "job_id": job.id,
        "worker": job.locked_by,
        "lease_expired_at": job.lease_expires_at.isoformat()
    }

@app.get("/healthz", tags=["Health"])
async def health_check():
    return {"status": "healthy", "service": "Reliable Webhook Engine", "timestamp": datetime.now(timezone.utc).isoformat()}
