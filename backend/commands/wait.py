"""WAIT command — pause execution for a specified number of seconds."""
from __future__ import annotations
import time
from typing import Any, Dict

from backend.commands import ArgSchema, Command, registry


def _execute(args: Dict[str, Any]) -> str:
    raw = args.get("seconds", 2)
    try:
        seconds = float(raw)
    except (TypeError, ValueError):
        seconds = 2.0

    # Clamp to a sensible range
    seconds = max(0.5, min(seconds, 120.0))

    time.sleep(seconds)
    return f"Waited {seconds:.1f}s."


registry.register(Command(
    name="WAIT",
    description=(
        "Pause execution for the specified number of seconds (0.5–120). "
        "Useful after triggering Unity compilation or asset import to give Unity "
        "time to finish before reading the console or checking results."
    ),
    args=[
        ArgSchema("seconds", "number", "Seconds to wait (0.5–120, default: 2)"),
    ],
    executor=_execute,
    category="system",
))
