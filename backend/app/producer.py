import os
import json
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from arq.connections import create_pool, RedisSettings, ArqRedis

from backend.app.config import settings
from backend.app.models import WebhookJob
from backend.app.schemas import WebhookDispatchInput, WebhookAcceptedResponse
from backend.app.events import event_bus

_arq_redis_pool: Optional[ArqRedis] = None

async def get_redis_pool() -> Optional[ArqRedis]:
    global _arq_redis_pool
    if os.environ.get("TESTING") == "1":
        return None
    if _arq_redis_pool is None:
        try:
            redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
            _arq_redis_pool = await create_pool(redis_settings)
            print("[Producer] Connected to ARQ Redis queue")
        except Exception as e:
            print(f"[Producer] Redis queue unavailable ({e}). Fallback mode active.")
            _arq_redis_pool = None
    return _arq_redis_pool

async def dispatch_webhook(
    payload_in: WebhookDispatchInput,
    db: AsyncSession,
) -> WebhookAcceptedResponse:
    now = datetime.now(timezone.utc)
    
    # 1. Idempotency Check
    if payload_in.idempotency_key:
        stmt = select(WebhookJob).where(WebhookJob.idempotency_key == payload_in.idempotency_key)
        result = await db.execute(stmt)
        existing_job = result.scalar_one_or_none()
        if existing_job:
            return WebhookAcceptedResponse(
                job_id=existing_job.id,
                status=existing_job.status,
                event_type=existing_job.event_type,
                destination_url=existing_job.destination_url,
                idempotency_key=existing_job.idempotency_key,
                created_at=existing_job.created_at,
                message="Idempotent duplicate: existing job returned"
            )

    # 2. Persist new Job Record to Database
    job_id = str(uuid.uuid4())
    job = WebhookJob(
        id=job_id,
        idempotency_key=payload_in.idempotency_key,
        event_type=payload_in.event_type,
        destination_url=str(payload_in.destination_url),
        payload=json.dumps(payload_in.payload),
        headers=json.dumps(payload_in.headers) if payload_in.headers else None,
        status="QUEUED",
        attempts=0,
        max_retries=payload_in.max_retries or settings.MAX_RETRIES,
        backoff_delay=settings.BACKOFF_BASE_SECONDS,
        created_at=now,
        updated_at=now,
    )
    db.add(job)
    await db.commit()

    # 3. Enqueue to ARQ Redis Queue
    pool = await get_redis_pool()
    enqueued_to_arq = False
    if pool:
        try:
            await pool.enqueue_job("deliver_webhook", job_id, _queue_name=settings.ARQ_QUEUE_NAME)
            enqueued_to_arq = True
        except Exception as e:
            print(f"[Producer] Failed to enqueue to ARQ ({e})")

    # If Redis is not running (e.g. standalone local test), trigger in-memory worker executor
    import os
    if not enqueued_to_arq and os.environ.get("TESTING") != "1":
        import asyncio
        from backend.app.worker import execute_webhook_job_in_memory
        asyncio.create_task(execute_webhook_job_in_memory(job_id))

    # 4. Publish Real-time SSE Event
    await event_bus.publish(
        event_type="JOB_DISPATCHED",
        job_id=job_id,
        data={
            "event_type": job.event_type,
            "destination_url": job.destination_url,
            "status": "QUEUED",
            "enqueued_to_arq": enqueued_to_arq,
            "attempts": 0,
            "max_retries": job.max_retries,
        }
    )

    # 5. Return 202 Accepted immediately
    return WebhookAcceptedResponse(
        job_id=job_id,
        status="QUEUED",
        event_type=job.event_type,
        destination_url=job.destination_url,
        idempotency_key=job.idempotency_key,
        created_at=job.created_at,
        message="Webhook accepted for reliable background delivery"
    )
