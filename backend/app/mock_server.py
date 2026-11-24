import asyncio
from typing import Dict
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/mock", tags=["Mock Destination Targets"])

# In-memory attempt tracker for flaky simulations
_flaky_attempts: Dict[str, int] = {}

class MockResponse(BaseModel):
    status: str
    message: str
    attempt: int = 1
    received_payload: dict = {}

@router.post("/success")
async def mock_success(request: Request):
    """Always returns 200 OK immediately."""
    payload = await request.json() if (await request.body()) else {}
    return {
        "status": "success",
        "code": 200,
        "message": "Webhook received successfully",
        "payload": payload
    }

@router.post("/flaky")
async def mock_flaky(request: Request, key: str = "default", fail_count: int = 2):
    """
    Simulates transient outages:
    Fails `fail_count` times with HTTP 503 Service Unavailable,
    then succeeds with HTTP 200 on subsequent attempts.
    """
    current = _flaky_attempts.get(key, 0) + 1
    _flaky_attempts[key] = current
    
    payload = await request.json() if (await request.body()) else {}

    if current <= fail_count:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Service Temporarily Unavailable",
                "attempt": current,
                "threshold": fail_count,
                "message": f"Simulated flaky upstream failure (attempt {current}/{fail_count})"
            }
        )
    
    return {
        "status": "recovered_success",
        "code": 200,
        "attempt": current,
        "message": f"Recovered! Succeeded on attempt {current} after {fail_count} transient failures.",
        "payload": payload
    }

@router.post("/fail-500")
async def mock_fail_500(request: Request):
    """Always returns 500 Internal Server Error to force retry exhaustion and DLQ."""
    payload = await request.json() if (await request.body()) else {}
    raise HTTPException(
        status_code=500,
        detail={
            "error": "InternalServerError",
            "message": "Fatal upstream database transaction deadlock - non-recoverable error",
            "payload": payload
        }
    )

@router.post("/slow")
async def mock_slow(request: Request, delay_seconds: float = 3.0):
    """
    Simulates a long-running webhook delivery.
    Useful for testing lease renewals and simulating kill -9 worker interruption.
    """
    payload = await request.json() if (await request.body()) else {}
    await asyncio.sleep(delay_seconds)
    return {
        "status": "delayed_success",
        "delayed_seconds": delay_seconds,
        "message": f"Processed successfully after {delay_seconds}s latency",
        "payload": payload
    }

@router.post("/reset-flaky")
async def reset_flaky():
    _flaky_attempts.clear()
    return {"message": "Flaky trackers cleared"}
