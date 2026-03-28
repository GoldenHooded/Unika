"""
Conversation history storage per channel.
Stored as JSON files: data/projects/{project_id}/channels/{channel_id}.json
"""
from __future__ import annotations
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend import settings as cfg

PROJECTS_DIR = cfg.DATA_DIR / "projects"


def _channel_path(project_id: str, channel_id: str) -> Path:
    return PROJECTS_DIR / project_id / "channels" / f"{channel_id}.json"


def _ensure_dir(project_id: str) -> None:
    (PROJECTS_DIR / project_id / "channels").mkdir(parents=True, exist_ok=True)


def load_history(project_id: str, channel_id: str) -> List[Dict[str, Any]]:
    _ensure_dir(project_id)
    path = _channel_path(project_id, channel_id)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("messages", [])
    except Exception:
        return []


def save_history(project_id: str, channel_id: str, messages: List[Dict[str, Any]]) -> None:
    _ensure_dir(project_id)
    path = _channel_path(project_id, channel_id)
    path.write_text(
        json.dumps({"messages": messages, "updated_at": time.time()}, ensure_ascii=False),
        encoding="utf-8",
    )


def append_message(
    project_id: str, channel_id: str, role: str, content: str,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    history = load_history(project_id, channel_id)
    msg: Dict[str, Any] = {"role": role, "content": content, "ts": time.time()}
    if extra:
        msg.update(extra)
    history.append(msg)
    save_history(project_id, channel_id, history)


def clear_history(project_id: str, channel_id: str) -> None:
    path = _channel_path(project_id, channel_id)
    if path.exists():
        path.unlink()


def get_all_channel_summaries(project_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """Return last 3 messages per channel for cross-reference display."""
    _ensure_dir(project_id)
    channels_dir = PROJECTS_DIR / project_id / "channels"
    result = {}
    for f in channels_dir.glob("*.json"):
        channel_id = f.stem
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            msgs = data.get("messages", [])
            result[channel_id] = msgs[-3:] if msgs else []
        except Exception:
            result[channel_id] = []
    return result
