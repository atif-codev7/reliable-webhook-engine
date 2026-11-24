import os
from pydantic import BaseModel
from typing import List

class Settings(BaseModel):
    PROJECT_NAME: str = "Reliable Webhook & Asynchronous Job Engine"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "sqlite+aiosqlite:///./webhooks.db"
    )
    
    # Redis & ARQ
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    ARQ_QUEUE_NAME: str = os.getenv("ARQ_QUEUE_NAME", "webhook_queue")
    
    # Retry & Backoff Policy
    # Sequence: 1s, 2s, 4s, 8s, 16s
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "5"))
    BACKOFF_BASE_SECONDS: float = float(os.getenv("BACKOFF_BASE_SECONDS", "1.0"))
    BACKOFF_FACTOR: float = float(os.getenv("BACKOFF_FACTOR", "2.0"))
    
    # Fault Tolerance & Worker Lease Configuration
    LEASE_DURATION_SECONDS: int = int(os.getenv("LEASE_DURATION_SECONDS", "10"))
    LEASE_HEARTBEAT_INTERVAL: int = int(os.getenv("LEASE_HEARTBEAT_INTERVAL", "3"))
    WATCHDOG_CHECK_INTERVAL: int = int(os.getenv("WATCHDOG_CHECK_INTERVAL", "4"))
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
        "*"
    ]

settings = Settings()
