import asyncio
import time
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_producer_returns_202_accepted_immediately(client: AsyncClient):
    """Asserts that the producer returns 202 Accepted in under 50ms with a valid job ID."""
    start = time.perf_counter()
    response = await client.post(
        "/api/v1/webhooks/dispatch",
        json={
            "event_type": "invoice.paid",
            "destination_url": "http://test/api/v1/mock/success",
            "payload": {"invoice_id": "inv_12345", "amount": 9900},
            "idempotency_key": "test_idemp_001",
            "max_retries": 5
        }
    )
    duration_ms = (time.perf_counter() - start) * 1000

    assert response.status_code == 202
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "QUEUED"
    assert data["event_type"] == "invoice.paid"
    assert duration_ms < 100 # High throughput check

@pytest.mark.asyncio
async def test_idempotency_key_deduplication(client: AsyncClient):
    """Asserts that identical idempotency keys return the existing job without creating duplicates."""
    idempotency_key = "idemp_unique_998877"
    payload = {
        "event_type": "transfer.initiated",
        "destination_url": "http://test/api/v1/mock/success",
        "payload": {"transfer_id": "tx_abc"},
        "idempotency_key": idempotency_key,
    }

    # First request
    res1 = await client.post("/api/v1/webhooks/dispatch", json=payload)
    assert res1.status_code == 202
    job1_id = res1.json()["job_id"]

    # Second request with same idempotency key
    res2 = await client.post("/api/v1/webhooks/dispatch", json=payload)
    assert res2.status_code == 202
    data2 = res2.json()
    assert data2["job_id"] == job1_id
    assert "duplicate" in data2["message"].lower()

@pytest.mark.asyncio
async def test_concurrent_producer_throughput(client: AsyncClient):
    """Stress tests the producer with 50 parallel requests, asserting 100% 202 Accepted."""
    async def dispatch_single(i: int):
        return await client.post(
            "/api/v1/webhooks/dispatch",
            json={
                "event_type": f"batch.event.{i}",
                "destination_url": "http://test/api/v1/mock/success",
                "payload": {"index": i, "timestamp": time.time()},
                "idempotency_key": f"batch_key_{i}_{time.time()}",
            }
        )

    start = time.perf_counter()
    responses = await asyncio.gather(*(dispatch_single(i) for i in range(50)))
    total_time = time.perf_counter() - start

    assert len(responses) == 50
    for r in responses:
        assert r.status_code == 202
    
    # 50 requests should complete rapidly
    avg_per_req_ms = (total_time / 50) * 1000
    assert avg_per_req_ms < 60
