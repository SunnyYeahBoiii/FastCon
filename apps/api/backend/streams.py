from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from collections.abc import Awaitable, Callable


class SubmissionBroadcaster:
    def __init__(self) -> None:
        self._channels: dict[str, set[asyncio.Queue[dict]]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, user_id: str) -> tuple[asyncio.Queue[dict], Callable[[], Awaitable[None]]]:
        queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=16)
        async with self._lock:
            self._channels[user_id].add(queue)

        async def unsubscribe() -> None:
            async with self._lock:
                listeners = self._channels.get(user_id)
                if listeners is None:
                    return
                listeners.discard(queue)
                if not listeners:
                    self._channels.pop(user_id, None)

        return queue, unsubscribe

    async def publish(self, user_id: str, payload: dict) -> None:
        async with self._lock:
            listeners = list(self._channels.get(user_id, ()))

        for queue in listeners:
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass


def named_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def default_event(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
