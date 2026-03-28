"""
Unity HTTP bridge client.
Connects to the UnikaBridge C# plugin running inside the Unity Editor via HTTP REST.

  GET  http://localhost:6400/ping     → {"status":"ok"}  (health-check, polled every 3 s)
  POST http://localhost:6400/command  → request/response for all Unity commands

No WebSocket needed — plain HTTP works reliably with Mono's HttpListener in Unity.
"""
from __future__ import annotations

import json
import time
import threading
import urllib.error
import urllib.request
import uuid
from typing import Any, Dict, Optional

from backend import settings as cfg
from backend.events import bus

_bridge_instance: Optional["UnityBridge"] = None


def get_bridge() -> Optional["UnityBridge"]:
    return _bridge_instance


def set_bridge(b: "UnityBridge") -> None:
    global _bridge_instance
    _bridge_instance = b


class UnityBridge:
    """
    HTTP client for Unity Editor bridge.

    Polls GET /ping every 3 seconds to track connection state.
    Sends commands via blocking POST /command (request → response).
    Thread-safe: send_sync() can be called from any thread.
    """

    def __init__(self, port: Optional[int] = None):
        self.port        = port or cfg.get("unity_bridge_port", 6400)
        self.is_connected = False
        self._base_url   = f"http://localhost:{self.port}"
        self._running    = False
        self._thread: Optional[threading.Thread] = None
        # suppress "connect_failed" spam: only emit on state changes + first failure
        self._first_fail_emitted = False

    # ── Lifecycle ────────────────────────────────────────────────────────────────

    def start(self) -> None:
        self._running = True
        self._thread  = threading.Thread(
            target=self._poll_loop, daemon=True, name="UnikaBridgePoll"
        )
        self._thread.start()
        # Announce immediately so debug panel shows the bridge is alive
        self._emit_debug("polling", port=self.port)

    def stop(self) -> None:
        self._running = False

    # ── Connection polling ───────────────────────────────────────────────────────

    def _poll_loop(self) -> None:
        import logging
        _log = logging.getLogger("unika.bridge")
        attempt = 0

        while self._running:
            ok, exc = self._ping()
            attempt += 1

            if ok and not self.is_connected:
                # Newly connected
                self.is_connected        = True
                self._first_fail_emitted = False
                _log.info("[Unika] Connected on port %d", self.port)
                bus.emit({"type": "unity_connected", "port": self.port})
                self._emit_debug("connected", port=self.port, attempt=attempt)

            elif not ok and self.is_connected:
                # Lost an existing connection
                self.is_connected = False
                _log.warning("[Unika] Connection lost: %s", exc)
                bus.emit({"type": "unity_disconnected"})
                self._emit_debug("lost", error=str(exc) or type(exc).__name__,
                                 error_kind=type(exc).__name__, attempt=attempt)

            elif not ok:
                # Not yet connected — emit on every attempt so user sees it's alive
                err = str(exc) or type(exc).__name__
                _log.debug("[Unika] Attempt %d failed: %s", attempt, err)
                self._emit_debug("connect_failed",
                                 error=err,
                                 error_kind=type(exc).__name__,
                                 port=self.port,
                                 attempt=attempt)

            time.sleep(3)

    def _ping(self) -> tuple[bool, Optional[Exception]]:
        try:
            resp = urllib.request.urlopen(f"{self._base_url}/ping", timeout=2)
            data = json.loads(resp.read())
            return data.get("status") == "ok", None
        except Exception as e:
            return False, e

    # ── Command send (blocking) ──────────────────────────────────────────────────

    def send_sync(self, payload: Dict[str, Any], timeout: float = 30.0) -> Dict[str, Any]:
        """
        Send a command to Unity and block until the response arrives.
        Raises ConnectionError if not connected, TimeoutError on timeout.
        """
        if not self.is_connected:
            raise ConnectionError("Unity is not connected.")

        payload.setdefault("id", str(uuid.uuid4()))
        body = json.dumps(payload).encode("utf-8")
        req  = urllib.request.Request(
            f"{self._base_url}/command",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=timeout)
            return json.loads(resp.read())
        except urllib.error.URLError as e:
            # Connection refused / network error → mark as disconnected
            if self.is_connected:
                self.is_connected = False
                bus.emit({"type": "unity_disconnected"})
                self._emit_debug("lost", error=str(e), error_kind=type(e).__name__)
            raise ConnectionError(f"Unity connection lost: {e}") from e
        except TimeoutError:
            raise TimeoutError(f"Unity did not respond within {timeout}s")
        except Exception as e:
            raise RuntimeError(f"Unity command failed: {e}") from e

    # ── Internal helpers ─────────────────────────────────────────────────────────

    def _emit_debug(self, state: str, **extra: Any) -> None:
        bus.emit({
            "type":         "debug_event",
            "phase":        "unity_bridge",
            "state":        state,
            "timestamp_ms": int(time.time() * 1000),
            "channel":      "general",
            **extra,
        })
