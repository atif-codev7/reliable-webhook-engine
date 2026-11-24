# Project 2: Reliable Webhook & Asynchronous Job Engine

> **FLAGSHIP ARCHITECTURAL PORTFOLIO — PROJECT 2**  
> **Stack:** Next.js (SSE) → FastAPI Producer → Redis Queue → ARQ Async Workers → PostgreSQL → DLQ  
> **Core Focus:** Async Background Execution, Fault Tolerance, At-Least-Once Delivery, Kill -9 Recovery Proof

---

## 🏛️ Architectural Overview

```
                      +------------------------------------------+
                      |         Next.js UI (SSE Client)          |
                      |  - Real-time SSE State Timeline Stream   |
                      |  - Webhook Dispatcher & Quick Presets    |
                      |  - Dead Letter Queue (DLQ) Inspector     |
                      |  - Interactive Kill -9 Chaos Lab         |
                      +--------------------+---------------------+
                                           | HTTP Dispatch (POST /api/v1/webhooks/dispatch)
                                           v
                      +------------------------------------------+
                      |             FastAPI Producer             |
                      |  - Idempotency Deduplication Key Check   |
                      |  - DB Persist (Initial Job State)        |
                      |  - Enqueue to Redis ARQ                  |
                      |  - Returns 202 Accepted (< 20ms)         |
                      +--------------------+---------------------+
                                           | Enqueue Job
                                           v
                      +------------------------------------------+
                      |           Redis / ARQ Queue              |
                      +--------------------+---------------------+
                                           | Claim Task + Lease Lock
                                           v
                      +------------------------------------------+
                      |             ARQ Worker Fleet             |
                      |  - Distributed Lease Heartbeat (Every 3s)|
                      |  - Exponential Backoff: 1s,2s,4s,8s,16s  |
                      |  - Audit Log Tracking (JobAttempt)       |
                      +--------------------+---------------------+
                           /                               \
               Success    /                                 \  Retries Exhausted (5x)
                         v                                   v
             +-----------------------+              +-----------------------+
             | State: COMPLETED      |              | Dead Letter Queue     |
             | Broadcast SSE Event   |              | - Isolated from queue |
             +-----------------------+              | - Manual Replay / API |
                                                    +-----------------------+

           ================== FAULT-TOLERANCE DEFENSE ==================
           [ Watchdog Reconciler (Zombie Hunter) ]
           - Periodically scans for: status == 'PROCESSING' && lease_expires_at < now()
           - Detects worker process sudden death (SIGKILL / kill -9 / OOM)
           - Reclaims lock, logs crash audit, and re-enqueues without dropping tasks!
```

---

## ⚡ Key Architectural Features

1. **High-Throughput Producer (202 Accepted)**:
   - Validates incoming webhook requests and generates a unique UUID.
   - Enforces client idempotency through `X-Idempotency-Key` or `idempotency_key` payload attribute.
   - Writes the initial job record directly into PostgreSQL/SQLite and enqueues to Redis.
   - Returns HTTP `202 Accepted` immediately in under 20ms, decoupling client latency from downstream webhook response times.

2. **Exponential Backoff Policy (1s, 2s, 4s, 8s, 16s)**:
   - When downstream targets fail (HTTP 5xx, timeouts, connection refused):
     $$T_{\text{wait}} = \text{Base} \times (\text{Factor}^{\text{attempt} - 1})$$
   - Default schedule: $1\text{s} \to 2\text{s} \to 4\text{s} \to 8\text{s} \to 16\text{s}$.
   - Deferral handled natively via ARQ's `_defer_by` delayed execution.

3. **Dead Letter Queue (DLQ) Isolation**:
   - Once max retries (default: 5) are exhausted, the job is quarantined into `DLQ` state.
   - Full stack trace, last status code, and chronological audit trail of all attempts are preserved.
   - Replay options:
     - 1-Click single item retry (`POST /api/v1/dlq/{id}/retry`).
     - Batch replay of all isolated items (`POST /api/v1/dlq/retry-all`).

4. **Kill -9 Recovery Proof (Fault Tolerance & Zero Zombie States)**:
   - **The Problem:** When an asynchronous worker is killed abruptly (`kill -9`, SIGKILL, node termination, or out-of-memory killer), no `finally` blocks or graceful shutdown hooks execute. In traditional architectures, in-flight jobs remain locked in "processing" indefinitely (zombie state) or are dropped entirely.
   - **The Solution:** Dual-defense Lease Heartbeats & Watchdog Reconciliation:
     1. When a worker claims a job, it acquires a lease: `lease_expires_at = now() + 10s`.
     2. A background coroutine within the worker extends this lease every 3 seconds while delivery is in-flight.
     3. If the worker process is killed (`kill -9`), the heartbeat abruptly stops, allowing the lease to expire.
     4. The **Watchdog Reconciler** queries for orphaned jobs where `status == 'PROCESSING'` and `lease_expires_at < now()`.
     5. The watchdog atomically breaks the dead worker's lock, logs a `CRASH DETECTED` audit record with the dead worker's ID, resets status to `QUEUED`, and re-enqueues the job to the active worker fleet.
     6. **Result:** 100% at-least-once delivery with zero dropped tasks and zero zombie locks.

5. **Real-Time Server-Sent Events (SSE) Delivery Dashboard**:
   - Streams live state machine events directly to the Next.js UI over a persistent HTTP connection (`/api/v1/events/stream`).
   - Visual badges for `JOB_DISPATCHED`, `JOB_PROCESSING`, `JOB_RETRY_SCHEDULED`, `JOB_COMPLETED`, `JOB_DEAD_LETTERED`, and `JOB_RECOVERED_FROM_CRASH`.

---

## 🚀 Quickstart & Running Instructions

### 1. Docker Compose (Full Stack with PostgreSQL & Redis)

```bash
# Clone and enter directory
cd reliable-webhook-engine

# Start the full cluster: Postgres, Redis, FastAPI Producer, ARQ Worker, Watchdog, Next.js UI
docker compose up --build
```

- **Next.js Dashboard:** [http://localhost:3000](http://localhost:3000)
- **FastAPI OpenAPI Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **SSE Stream:** [http://localhost:8000/api/v1/events/stream](http://localhost:8000/api/v1/events/stream)

---

### 2. Standalone Local Development (Zero Docker Required)

The engine features an intelligent local fallback mode (Async SQLite + in-memory task runner) so developers can run and test everything immediately without external services.

#### Backend:
```bash
cd backend
# Activate virtual environment
.\.venv\Scripts\Activate.ps1   # Windows
# or: source .venv/bin/activate # Linux/macOS

# Start FastAPI server
python -m uvicorn backend.app.main:app --reload --port 8000
```

#### Frontend:
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## 🧪 Automated Pytest Test Suite

Run the full verification suite covering producer throughput, exponential retries, DLQ isolation, and the simulated kill -9 recovery proof:

```bash
cd reliable-webhook-engine
.\.venv\Scripts\python.exe -m pytest backend/tests -v
```

---

## 📡 API Reference Summary

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/webhooks/dispatch` | Dispatches webhook with idempotency check, returns `202 Accepted` |
| `GET` | `/api/v1/events/stream` | Server-Sent Events (SSE) real-time state change bus |
| `GET` | `/api/v1/jobs` | Lists all webhooks with attempt history and status filtering |
| `GET` | `/api/v1/jobs/{job_id}` | Detailed inspection of a specific job and its attempts |
| `GET` | `/api/v1/dlq` | Lists all quarantined jobs in Dead Letter Queue |
| `POST` | `/api/v1/dlq/{job_id}/retry` | Manually re-triggers a dead-lettered job |
| `POST` | `/api/v1/dlq/retry-all` | Batch re-triggers all jobs in DLQ |
| `GET` | `/api/v1/stats` | Aggregated metrics: throughput, latency, DLQ count, success % |
| `POST` | `/api/v1/chaos/simulate-worker-crash` | Simulates sudden `kill -9` worker death on in-flight job |
| `POST` | `/api/v1/chaos/trigger-reconciliation` | Manually invokes Watchdog Reconciler |
