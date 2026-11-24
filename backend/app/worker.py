import asyncio
import json
import os
import socket
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
import httpx
from sqlalchemy import select
from arq.connections import RedisSettings

from backend.app.config import settings
import backend.app.database as db_module
from backend.app.models import WebhookJob, JobAttempt, WorkerNode
from backend.app.events import event_bus

WORKER_ID = f"worker-{socket.gethostname()}-{os.getpid()}"

def utcnow():
    return datetime.now(timezone.utc)

def calculate_backoff(attempt: int) -> float:
    """
    Exponential backoff sequence:
    attempt 1: 1.0s
    attempt 2: 2.0s
    attempt 3: 4.0s
    attempt 4: 8.0s
    attempt 5: 16.0s
    """
    exponent = max(0, attempt - 1)
    return settings.BACKOFF_BASE_SECONDS * (settings.BACKOFF_FACTOR ** exponent)

async def heartbeat_lease_renewal(job_id: str, stop_event: asyncio.Event):
    """
    Background coroutine extending worker lease while job is in-flight.
    If worker process is killed with kill -9, this coroutine instantly terminates,
    causing lease_expires_at to elapse and watchdog to recover the job!
    """
    while not stop_event.is_set():
        try:
            await asyncio.sleep(settings.LEASE_HEARTBEAT_INTERVAL)
            if stop_event.is_set():
                break
            async with db_module.AsyncSessionLocal() as db:
                stmt = select(WebhookJob).where(WebhookJob.id == job_id)
                res = await db.execute(stmt)
                job = res.scalar_one_or_none()
                if job and job.status == "PROCESSING" and job.locked_by == WORKER_ID:
                    job.lease_expires_at = utcnow() + timedelta(seconds=settings.LEASE_DURATION_SECONDS)
                    await db.commit()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[Worker:{WORKER_ID}] Lease heartbeat warning for {job_id}: {e}")

async def process_job_execution(job_id: str) -> Dict[str, Any]:
    """
    Executes a webhook job with lease locking, HTTP dispatch,
    attempt tracking, exponential backoff, and DLQ isolation.
    """
    start_time = time.time()
    stop_heartbeat = asyncio.Event()
    heartbeat_task = None

    async with db_module.AsyncSessionLocal() as db:
        stmt = select(WebhookJob).where(WebhookJob.id == job_id)
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()

        if not job:
            return {"error": "Job not found"}

        if job.status in ("COMPLETED", "DLQ"):
            return {"status": job.status, "message": "Job already terminal"}

        # 1. Acquire Lease
        job.status = "PROCESSING"
        job.locked_by = WORKER_ID
        job.locked_at = utcnow()
        job.lease_expires_at = utcnow() + timedelta(seconds=settings.LEASE_DURATION_SECONDS)
        job.attempts += 1
        current_attempt = job.attempts
        destination_url = job.destination_url
        max_retries = job.max_retries
        headers = json.loads(job.headers) if job.headers else {}
        payload = json.loads(job.payload) if job.payload else {}
        
        await db.commit()

    # Emit real-time SSE event
    await event_bus.publish(
        event_type="JOB_PROCESSING",
        job_id=job_id,
        data={
            "worker_id": WORKER_ID,
            "attempt": current_attempt,
            "max_retries": max_retries,
            "destination_url": destination_url,
            "lease_duration_sec": settings.LEASE_DURATION_SECONDS
        }
    )

    # Start background lease renewal
    heartbeat_task = asyncio.create_task(heartbeat_lease_renewal(job_id, stop_heartbeat))

    # 2. Execute HTTP Webhook Dispatch
    status_code: Optional[int] = None
    response_text: Optional[str] = None
    error_message: Optional[str] = None
    success = False

    try:
        custom_headers = {
            "Content-Type": "application/json",
            "User-Agent": "ReliableWebhookEngine/1.0",
            "X-Webhook-Delivery-Attempt": str(current_attempt),
            "X-Webhook-Job-ID": job_id,
            **headers
        }

        # If targeting in-memory ASGI test endpoint, route directly via ASGITransport
        if destination_url.startswith("http://test"):
            from backend.app.main import app as asgi_app
            transport = httpx.ASGITransport(app=asgi_app)
            client_kwargs = {"transport": transport, "base_url": "http://test"}
        else:
            client_kwargs = {"timeout": 10.0}

        async with httpx.AsyncClient(**client_kwargs) as client:
            resp = await client.post(destination_url, json=payload, headers=custom_headers)
            status_code = resp.status_code
            response_text = resp.text[:1000] # store max 1000 chars

            if 200 <= status_code < 300:
                success = True
            else:
                error_message = f"HTTP {status_code}: {response_text}"

    except httpx.RequestError as exc:
        error_message = f"Network Request Error: {str(exc)}"
    except Exception as exc:
        error_message = f"Unexpected Dispatch Error: {str(exc)}"
    finally:
        # Stop lease heartbeat
        stop_heartbeat.set()
        if heartbeat_task:
            heartbeat_task.cancel()

    duration_ms = round((time.time() - start_time) * 1000, 2)

    # 3. Post-Execution State & Audit Persistence
    async with db_module.AsyncSessionLocal() as db:
        stmt = select(WebhookJob).where(WebhookJob.id == job_id)
        res = await db.execute(stmt)
        job = res.scalar_one_or_none()
        if not job:
            return {"error": "Job disappeared"}

        # Record attempt audit
        attempt_record = JobAttempt(
            job_id=job.id,
            attempt_number=current_attempt,
            status_code=status_code,
            response_body=response_text,
            error_message=error_message,
            duration_ms=duration_ms,
            attempted_at=utcnow()
        )
        db.add(attempt_record)

        # Clear lease
        job.locked_by = None
        job.locked_at = None
        job.lease_expires_at = None
        job.last_status_code = status_code
        job.last_error = error_message
        job.updated_at = utcnow()

        if success:
            job.status = "COMPLETED"
            job.completed_at = utcnow()
            job.next_retry_at = None
            await db.commit()

            await event_bus.publish(
                event_type="JOB_COMPLETED",
                job_id=job.id,
                data={
                    "status_code": status_code,
                    "attempt": current_attempt,
                    "duration_ms": duration_ms,
                    "worker_id": WORKER_ID
                }
            )
            return {"status": "COMPLETED", "attempt": current_attempt}

        else:
            # Check retries vs DLQ
            if current_attempt < max_retries:
                # Schedule exponential backoff
                delay = calculate_backoff(current_attempt)
                next_retry = utcnow() + timedelta(seconds=delay)
                job.status = "RETRYING"
                job.backoff_delay = delay
                job.next_retry_at = next_retry
                await db.commit()

                await event_bus.publish(
                    event_type="JOB_RETRY_SCHEDULED",
                    job_id=job.id,
                    data={
                        "attempt": current_attempt,
                        "max_retries": max_retries,
                        "backoff_delay_sec": delay,
                        "next_retry_at": next_retry.isoformat(),
                        "error": error_message,
                        "worker_id": WORKER_ID
                    }
                )

                # Re-enqueue to ARQ or in-memory runner with defer
                from backend.app.producer import get_redis_pool
                pool = await get_redis_pool()
                if pool:
                    await pool.enqueue_job(
                        "deliver_webhook", 
                        job.id, 
                        _defer_by=timedelta(seconds=delay),
                        _queue_name=settings.ARQ_QUEUE_NAME
                    )
                elif os.environ.get("TESTING") != "1":
                    # In-memory async fallback (skip auto-retrigger during unit tests)
                    async def delayed_execution(jid: str, wait_sec: float):
                        await asyncio.sleep(wait_sec)
                        await execute_webhook_job_in_memory(jid)
                    asyncio.create_task(delayed_execution(job.id, delay))

                return {"status": "RETRYING", "delay": delay, "attempt": current_attempt}

            else:
                # Max retries exhausted -> Move to Dead Letter Queue (DLQ)
                job.status = "DLQ"
                job.next_retry_at = None
                await db.commit()

                await event_bus.publish(
                    event_type="JOB_DEAD_LETTERED",
                    job_id=job.id,
                    data={
                        "total_attempts": current_attempt,
                        "max_retries": max_retries,
                        "final_error": error_message,
                        "last_status_code": status_code,
                        "worker_id": WORKER_ID,
                        "destination_url": job.destination_url
                    }
                )
                return {"status": "DLQ", "final_error": error_message}

async def deliver_webhook(ctx: dict, job_id: str):
    """ARQ Worker task entrypoint."""
    return await process_job_execution(job_id)

async def execute_webhook_job_in_memory(job_id: str):
    """Fallback executor for standalone execution without standalone ARQ process."""
    return await process_job_execution(job_id)

class WorkerSettings:
    functions = [deliver_webhook]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    queue_name = settings.ARQ_QUEUE_NAME
    max_jobs = 10
    poll_delay = 0.5

    @classmethod
    async def on_startup(cls, ctx: dict):
        print(f"[ARQ Worker] Initialized worker {WORKER_ID}")
        # Register worker node in DB
        async with AsyncSessionLocal() as db:
            node = WorkerNode(
                worker_id=WORKER_ID,
                hostname=socket.gethostname(),
                pid=os.getpid(),
                status="ACTIVE",
                started_at=utcnow(),
                last_heartbeat=utcnow()
            )
            db.add(node)
            await db.commit()

    @classmethod
    async def on_shutdown(cls, ctx: dict):
        print(f"[ARQ Worker] Shutting down worker {WORKER_ID}")
        async with AsyncSessionLocal() as db:
            stmt = select(WorkerNode).where(WorkerNode.worker_id == WORKER_ID)
            res = await db.execute(stmt)
            node = res.scalar_one_or_none()
            if node:
                node.status = "TERMINATED"
                await db.commit()
