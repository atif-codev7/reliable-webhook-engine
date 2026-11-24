import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models import WebhookJob, JobAttempt
from backend.app.watchdog import reconcile_orphaned_jobs
from backend.app.worker import process_job_execution

@pytest.mark.asyncio
async def test_kill_9_worker_recovery_proof(client: AsyncClient, db_session: AsyncSession):
    """
    CRITICAL ARCHITECTURAL PROOF:
    Simulates a worker being killed mid-execution (SIGKILL / kill -9) without running cleanup hooks.
    Proves that:
    1. The job is left in 'PROCESSING' with an expired lease.
    2. The Watchdog detects the dead worker's orphaned job.
    3. The lock is reclaimed, crash audit logged, and the job is re-enqueued.
    4. The job is subsequently executed to completion with zero data loss.
    """
    now = datetime.now(timezone.utc)

    # 1. Dispatch a webhook job
    res = await client.post(
        "/api/v1/webhooks/dispatch",
        json={
            "event_type": "settlement.reconciliation",
            "destination_url": "http://test/api/v1/mock/success",
            "payload": {"batch_id": "batch_992"},
            "max_retries": 5
        }
    )
    assert res.status_code == 202
    job_id = res.json()["job_id"]

    # 2. Simulate worker claiming job, then being abruptly killed (kill -9)
    # The worker acquired the lock, but died 5 seconds ago
    dead_worker_id = "worker-ec2-node-7-pid-4912"
    stmt = select(WebhookJob).where(WebhookJob.id == job_id)
    result = await db_session.execute(stmt)
    job = result.scalar_one()

    job.status = "PROCESSING"
    job.locked_by = dead_worker_id
    job.locked_at = now - timedelta(seconds=15)
    job.lease_expires_at = now - timedelta(seconds=5) # LEASE EXPIRED!
    job.attempts = 1
    await db_session.commit()

    # Verify stranded zombie state before recovery
    assert job.status == "PROCESSING"
    assert job.locked_by == dead_worker_id

    # 3. Execute Watchdog Reconciler (Zombie Hunter)
    recovered = await reconcile_orphaned_jobs()
    
    # Assert recovery occurred
    assert len(recovered) >= 1
    rec = next(r for r in recovered if r["job_id"] == job_id)
    assert rec["dead_worker"] == dead_worker_id

    # 4. Refresh and inspect database state
    await db_session.refresh(job)
    assert job.status == "QUEUED" # Safely returned to queue
    assert job.locked_by is None # Lock reclaimed
    assert job.lease_expires_at is None
    assert "Worker [" in job.last_error

    # 5. Inspect crash audit trail in JobAttempt table
    attempts_stmt = select(JobAttempt).where(JobAttempt.job_id == job_id)
    att_res = await db_session.execute(attempts_stmt)
    attempts = att_res.scalars().all()
    crash_logs = [a for a in attempts if "CRASH DETECTED" in (a.error_message or "")]
    assert len(crash_logs) == 1
    assert dead_worker_id in crash_logs[0].error_message

    # 6. Now another worker picks up the recovered job and completes it successfully!
    final_res = await process_job_execution(job_id)
    assert final_res["status"] == "COMPLETED"

    await db_session.refresh(job)
    assert job.status == "COMPLETED"
    assert job.completed_at is not None
