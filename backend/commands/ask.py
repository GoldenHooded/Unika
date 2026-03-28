"""
ASK command — interactive user questions with optional predefined options.
Supports both CLI (blocking input) and GUI (WebSocket event round-trip).
"""
from __future__ import annotations
import json
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from backend.commands import ArgSchema, Command, registry
from backend.events import bus

# Pending ask requests: {id: Event}
_pending: Dict[str, threading.Event] = {}
_answers: Dict[str, Any] = {}


def resolve_ask(ask_id: str, answers: Any) -> None:
    """Called by the WebSocket handler when the user answers."""
    _answers[ask_id] = answers
    event = _pending.get(ask_id)
    if event:
        event.set()


def _execute(args: Dict[str, Any]) -> str:
    questions_raw = args.get("questions", args.get("question", ""))

    # Normalize: single question string → list format
    if isinstance(questions_raw, str):
        questions = [{"question": questions_raw, "options": [], "allow_custom": True}]
    elif isinstance(questions_raw, list):
        questions = questions_raw
    else:
        questions = [questions_raw]

    ask_id = str(uuid.uuid4())
    event = threading.Event()
    _pending[ask_id] = event

    # Emit to GUI
    bus.emit({
        "type": "ask_questions",
        "id": ask_id,
        "questions": questions,
    })

    # CLI fallback: if no GUI listener sets the answer, prompt stdin
    def _cli_fallback():
        time.sleep(0.1)
        if event.is_set():
            return
        answers = []
        for q in questions:
            print(f"\n[Unika] {q['question']}")
            opts = q.get("options", [])
            for i, opt in enumerate(opts):
                label = opt["label"] if isinstance(opt, dict) else opt
                print(f"  {i+1}. {label}")
            raw = input("  > ").strip()
            # Try numeric selection
            if opts and raw.isdigit():
                idx = int(raw) - 1
                if 0 <= idx < len(opts):
                    opt = opts[idx]
                    answers.append(opt["label"] if isinstance(opt, dict) else opt)
                    continue
            answers.append(raw)
        _answers[ask_id] = answers
        event.set()

    t = threading.Thread(target=_cli_fallback, daemon=True)
    t.start()

    # Wait indefinitely — the user decides when to answer.
    event.wait()

    _pending.pop(ask_id, None)
    answers = _answers.pop(ask_id, None)

    if answers is None:
        return "[ASK] Question was cancelled."

    # Format answer summary
    if isinstance(answers, list):
        lines = []
        for i, q in enumerate(questions):
            q_text = q.get("question", f"Pregunta {i+1}") if isinstance(q, dict) else str(q)
            a_text = answers[i] if i < len(answers) else ""
            lines.append(f"- {q_text}: {a_text}")
        result_str = "Respuestas del usuario:\n" + "\n".join(lines)
    else:
        result_str = str(answers)

    # Execute commands associated with selected options (Nano Agent feature)
    from backend.commands import registry as _cmd_registry
    extra: list = []
    if isinstance(answers, list):
        for i, q in enumerate(questions):
            if not isinstance(q, dict):
                continue
            selected = answers[i] if i < len(answers) else None
            if not selected:
                continue
            for opt in q.get("options", []):
                if isinstance(opt, dict) and opt.get("label") == selected:
                    for cmd_spec in opt.get("commands", []):
                        name = cmd_spec.get("name", "")
                        args = cmd_spec.get("args", {})
                        if name:
                            res = _cmd_registry.execute(name, args)
                            extra.append(f"[{name}] → {res[:300]}")

    if extra:
        result_str += "\n\nComandos ejecutados por la opción seleccionada:\n" + "\n".join(extra)

    return result_str


registry.register(Command(
    name="ASK",
    description=(
        "Ask the user one or more questions interactively. Use ONLY when you need information "
        "that you cannot retrieve with tools, or before irreversible actions. "
        "Pass a list of question objects with optional predefined options."
    ),
    args=[
        ArgSchema(
            "questions",
            "array",
            (
                "Array of question objects. Each: {"
                "'question': str, "
                "'options': [{'label': str, 'description': str}], "
                "'multi_select': bool, "
                "'allow_custom': bool"
                "}"
            ),
        ),
    ],
    executor=_execute,
    category="interaction",
))
