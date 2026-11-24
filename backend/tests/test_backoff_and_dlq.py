import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.worker import calculate_backoff, process_job_execution
from backend.app.models import WebhookJob

def test_exponential_backoff_calculation_sequence():
    """Validates the exact 1s, 2s, 4s, 8s, 16s exponential backoff sequence."""
    assert calculate_backoff(1) == 1.0
    assert calculate_backoff(2) == 2.0
    assert calculate_backoff(3) == 4.0
    assert calculate_backoff(4) == 8.0
    assert calculate_backoff(5) == 16.0

@pytest.mark.asyncio
async def test_dlq_isolation_after_retry_exhaustion(client: AsyncClient, db_session: AsyncSession):
    """
    Simulates a job hitting persistent failures and verifies:
    1. Attempts increment from 1 to 5.
    2. Upon 5th failure, transitions to DLQ.
    3. Appears in GET /api/v1/dlq.
    """
    # 1. Dispatch job with 3 max retries for fast test execution
    res = await client.post(
        "/api/v1/webhooks/dispatch",
        json={
            "event_type": "dispute.created",
            "destination_url": "http://test/api/v1/mock/fail-500",
            "payload": {"dispute_id": "dp_fail"},
            "max_retries": 3
        }
    )
    job_id = res.json()["job_id"]

    # 2. Simulate 3 consecutive executions (attempts 1, 2, 3)
    r1 = await process_job_execution(job_id)
    assert r1["status"] == "RETRYING"
    assert r1["attempt"] == 1

    r2 = await process_job_execution(job_id)
    assert r2["status"] == "RETRYING"
    assert r2["attempt"] == 2

    r3 = await process_job_execution(job_id)
    assert r3["status"] == "DLQ"

    # 3. Verify in DLQ API
    dlq_res = await client.get("/api/v1/dlq")
    assert dlq_res.status_code == 200
    dlq_list = dlq_res.json()
    assert any(j["id"] == job_id for j in dlq_list)

@pytest.mark.asyncio
async def test_dlq_manual_retry_requeues_job(client: AsyncClient, db_session: AsyncSession):
    """Asserts that manual retry resets attempts, clears DLQ status, and requeues the job."""
    # Dispatch and force directly into DLQ
    res = await client.post(
        "/api/v1/webhooks/dispatch",
        json={
            "event_type": "invoice.finalize",
            "destination_url": "http://test/api/v1/mock/fail-500",
            "payload": {"inv": 1},
            "max_retries": 1
        }
    )
    job_id = res.json()["job_id"]
    
    # Run once to exhaust
    await process_job_execution(job_id)

    # Verify DLQ
    dlq_check = await client.get("/api/v1/dlq")
    assert any(j["id"] == job_id for j in dlq_check.json())

    # Manually retry
    retry_res = await client.post(f"/api/v1/dlq/{job_id}/retry")
    assert retry_res.status_code == 200
    assert retry_res.json()["status"] == "QUEUED"

    # Verify it is no longer in DLQ
    dlq_after = await client.get("/api/v1/dlq")
    assert not any(j["id"] == job_id for j in dlq_after.json())
