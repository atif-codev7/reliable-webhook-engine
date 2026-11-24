import asyncio
import json
from datetime import datetime, timezone
from typing import Set, Dict, Any, Optional
import redis.asyncio as aioredis
from backend.app.config import settings

def utcnow_str():
    return datetime.now(timezone.utc).isoformat()

class EventBus:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._redis_client: Optional[aioredis.Redis] = None
        self._redis_pubsub = None
        self._listener_task: Optional[asyncio.Task] = None

    async def init_redis(self):
        import os
        if os.environ.get("TESTING") == "1":
            return
        try:
            client = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
            await client.ping()
            self._redis_client = client
            # Start pubsub background listener
            self._redis_pubsub = self._redis_client.pubsub()
            await self._redis_pubsub.subscribe("webhook_events")
            self._listener_task = asyncio.create_task(self._listen_redis())
            print("[EventBus] Connected to Redis Pub/Sub for SSE broadcasting")
        except Exception as e:
            print(f"[EventBus] Redis pubsub not connected, using in-process event hub ({e})")
            self._redis_client = None

    async def _listen_redis(self):
        try:
            async for message in self._redis_pubsub.listen():
                if message["type"] == "message":
                    payload = message["data"]
                    try:
                        data = json.loads(payload)
                        await self._broadcast_in_memory(data)
                    except Exception as e:
                        print(f"[EventBus] Error decoding redis message: {e}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[EventBus] Redis listener stopped: {e}")

    async def register(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self._subscribers.add(q)
        return q

    def unregister(self, q: asyncio.Queue):
        self._subscribers.discard(q)

    async def _broadcast_in_memory(self, event_data: Dict[str, Any]):
        dead = []
        for q in list(self._subscribers):
            try:
                # non-blocking put with overflow protection
                if q.qsize() > 500:
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                q.put_nowait(event_data)
            except Exception:
                dead.append(q)
        for d in dead:
            self._subscribers.discard(d)

    async def publish(self, event_type: str, data: Dict[str, Any], job_id: Optional[str] = None):
        event = {
            "type": event_type,
            "job_id": job_id,
            "timestamp": utcnow_str(),
            "data": data,
        }
        # Publish in-memory
        await self._broadcast_in_memory(event)

        # Publish to Redis Pub/Sub if connected
        if self._redis_client:
            try:
                await self._redis_client.publish("webhook_events", json.dumps(event))
            except Exception:
                pass

    async def close(self):
        if self._listener_task:
            self._listener_task.cancel()
        if self._redis_pubsub:
            await self._redis_pubsub.close()
        if self._redis_client:
            await self._redis_client.close()

event_bus = EventBus()
