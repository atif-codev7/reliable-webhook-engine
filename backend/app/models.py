import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Integer, Float, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class WebhookJob(Base):
    __tablename__ = "webhook_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(128), index=True, nullable=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True, default="webhook.event")
    destination_url: Mapped[str] = mapped_column(String(512))
    payload: Mapped[str] = mapped_column(Text)
    headers: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # State: QUEUED -> PROCESSING -> (RETRYING -> PROCESSING)* -> COMPLETED / DLQ
    status: Mapped[str] = mapped_column(String(32), index=True, default="QUEUED")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=5)
    backoff_delay: Mapped[float] = mapped_column(Float, default=1.0)
    
    # Distributed Leases & Heartbeat Locking
    locked_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    next_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    attempts_history: Mapped[List["JobAttempt"]] = relationship(
        "JobAttempt", 
        back_populates="job", 
        cascade="all, delete-orphan", 
        order_by="JobAttempt.attempt_number",
        lazy="selectin"
    )

    __table_args__ = (
        Index("ix_webhook_jobs_status_lease", "status", "lease_expires_at"),
    )

class JobAttempt(Base):
    __tablename__ = "job_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("webhook_jobs.id", ondelete="CASCADE"), index=True)
    attempt_number: Mapped[int] = mapped_column(Integer)
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    job: Mapped["WebhookJob"] = relationship("WebhookJob", back_populates="attempts_history")

class WorkerNode(Base):
    __tablename__ = "worker_nodes"

    worker_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    hostname: Mapped[str] = mapped_column(String(128))
    pid: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE") # ACTIVE, DEAD, TERMINATED
    current_job_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    last_heartbeat: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    tasks_completed: Mapped[int] = mapped_column(Integer, default=0)
    tasks_failed: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
