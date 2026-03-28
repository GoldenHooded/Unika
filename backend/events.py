"""
Thread-safe event bus for GUI/CLI communication.
Emits events from background threads to async WebSocket handlers.
"""
from __future__ import annotations
import threading
import asyncio
from typing import Any, Callable, Dict, List, Optional


class EventBus:
    def __init__(self):
        self._lock = threading.Lock()
        self._listeners: List[Callable[[Dict[str, Any]], None]] = []
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def add_listener(self, fn: Callable[[Dict[str, Any]], None]) -> None:
        with self._lock:
            self._listeners.append(fn)

    def remove_listener(self, fn: Callable[[Dict[str, Any]], None]) -> None:
        with self._lock:
            self._listeners = [l for l in self._listeners if l is not fn]

    def clear_listeners(self) -> None:
        with self._lock:
            self._listeners.clear()

    def emit(self, event: Dict[str, Any]) -> None:
        with self._lock:
            listeners = list(self._listeners)
        for fn in listeners:
            try:
                fn(event)
            except Exception:
                pass


# Global singleton
bus = EventBus()
