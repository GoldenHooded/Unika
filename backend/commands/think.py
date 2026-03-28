"""THINK command — internal reasoning step that streams to the review panel."""
from __future__ import annotations
from typing import Any, Dict

from backend.commands import ArgSchema, Command, registry
from backend.events import bus


def _execute(args: Dict[str, Any]) -> str:
    content = args.get("content") or args.get("thought", "")
    if content:
        bus.emit({"type": "thinking_token", "content": content})
    return "[thought recorded]"


registry.register(Command(
    name="THINK",
    description=(
        "Record an internal reasoning step. Use this before any complex multi-step task "
        "to reason through the approach. Write your plan, analysis, or reasoning as 'content'. "
        "This is displayed in the review panel's thinking section and does not "
        "add noise to the conversation. Prefer THINK over embedding reasoning in your text response."
    ),
    args=[
        ArgSchema("content", "string", "Your internal reasoning, plan, or analysis"),
    ],
    executor=_execute,
    category="general",
))
