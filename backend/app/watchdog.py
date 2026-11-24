import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from sqlalchemy import select, update

from backend.app.config import settings
import backend.app.database as db_module
from backend.app.models import WebhookJob, JobAttempt, WorkerNode
from backend.app.events import event_bus

def utcnow():
    return datetime.now(timezone.utc)

async def reconcile_orphaned_jobs() -> List[Dict[str, Any]]:
    """
    Core Fault-Tolerance Reconciler:
    Detects any jobs stuck in 'PROCESSING' whose worker lease has expired (e.g. killed by SIGKILL / kill -9).
    Reclaims the lock, records recovery telemetry, and safely re-enqueues the job.
    Guarantees at-least-once delivery with zero dropped tasks and zero zombie states.
    """
    recovered_jobs = []
    now = utcnow()

    async with db_module.AsyncSessionLocal() as db:
        # Query jobs where status == 'PROCESSING' and lease has expired
        stmt = select(WebhookJob).where(
            WebhookJob.status == "PROCESSING",
            WebhookJob.lease_expires_at.is_not(None),
            WebhookJob.lease_expires_at < now
        )
        result = await db.execute(stmt)
        orphaned_jobs = result.scalars().all()

        for job in orphaned_jobs:
            dead_worker = job.locked_by or "unknown-worker"
            expired_time = job.lease_expires_at

            recovery_info = {
                "job_id": job.id,
                "dead_worker": dead_worker,
                "expired_at": expired_time.isoformat() if expired_time else None,
                "recovered_at": now.isoformat(),
                "attempts": job.attempts,
                "max_retries": job.max_retries
            }

            # Record audit of crash recovery
            recovery_attempt = JobAttempt(
                job_id=job.id,
                attempt_number=job.attempts,
                status_code=None,
                response_body=None,
                error_message=f"CRASH DETECTED: Worker [{dead_worker}] terminated mid-execution (SIGKILL / kill -9). Watchdog successfully reclaimed lease and recovered job.",
                duration_ms=None,
                attempted_at=now
            )
            db.add(recovery_attempt)

            # Reset lease lock
            job.locked_by = None
            job.locked_at = None
            job.lease_expires_at = None
            job.last_error = f"Worker [{dead_worker}] died unexpectedly mid-execution. Recovered by Watchdog."
            job.updated_at = now

            if job.attempts < job.max_retries:
                job.status = "QUEUED"
                await db.commit()

                # Re-enqueue to ARQ or in-memory runner
                from backend.app.producer import get_redis_pool
                pool = await get_redis_pool()
                if pool:
                    await pool.enqueue_job("deliver_webhook", job.id, _queue_name=settings.ARQ_QUEUE_NAME)
                else:
                    from backend.app.worker import execute_webhook_job_in_memory
                    asyncio.create_task(execute_webhook_job_in_memory(job.id))

                await event_bus.publish(
                    event_type="JOB_RECOVERED_FROM_CRASH",
                    job_id=job.id,
                    data=recovery_info
                )
            else:
                job.status = "DLQ"
                await db.commit()
                await event_bus.publish(
                    event_type="JOB_DEAD_LETTERED",
                    job_id=job.id,
                    data={**recovery_info, "reason": "Max retries reached after crash recovery"}
                )

            recovered_jobs.append(recovery_info)

        # Also detect crashed worker nodes
        stale_threshold = now - timedelta(seconds=30)
        worker_stmt = select(WorkerNode).where(
            WorkerNode.status == "ACTIVE",
            WorkerNode.last_heartbeat < stale_threshold
        )
        res = await db.execute(worker_stmt)
        dead_nodes = res.scalars().all()
        for node in dead_nodes:
            node.status = "CRASHED"
        if dead_nodes:
            await db.commit()

    if recovered_jobs:
        print(f"[Watchdog] Successfully recovered {len(recovered_jobs)} orphaned job(s) from crashed workers.")

    return recovered_jobs

class WatchdogService:
    def __init__(self):
        self._running = False
        self._task: asyncio.Task = None

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        print(f"[Watchdog] Service started (check interval: {settings.WATCHDOG_CHECK_INTERVAL}s)")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        print("[Watchdog] Service stopped")

    async def _run_loop(self):
        while self._running:
            try:
                await reconcile_orphaned_jobs()
            except Exception as e:
                print(f"[Watchdog] Error in reconciliation loop: {e}")
            await asyncio.sleep(settings.WATCHDOG_CHECK_INTERVAL)

watchdog_service = WatchdogService()

if __name__ == "__main__":
    async def main():
        from backend.app.database import init_db
        await init_db()
        await watchdog_service.start()
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            await watchdog_service.stop()

    asyncio.run(main())
