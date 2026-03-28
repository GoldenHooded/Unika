"""
MEMORY_SAVE and MEMORY_SEARCH — cross-session persistent memory store.
Stored in data/memory/store.json as key-value entries with tags and timestamps.
"""
from __future__ import annotations
import json
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List

from backend.commands import ArgSchema, Command, registry
from backend import settings as cfg

MEMORY_FILE = cfg.DATA_DIR / "memory" / "store.json"
SIMILARITY_THRESHOLD = 0.45


def _load_store() -> List[Dict[str, Any]]:
    MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    if MEMORY_FILE.exists():
        try:
            return json.loads(MEMORY_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save_store(store: List[Dict[str, Any]]) -> None:
    MEMORY_FILE.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _save(args: Dict[str, Any]) -> str:
    key = args["key"]
    value = args["value"]
    tags = args.get("tags", [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",")]

    store = _load_store()
    # Update existing entry with same key
    for entry in store:
        if entry.get("key") == key:
            entry["value"] = value
            entry["tags"] = tags
            entry["updated_at"] = time.time()
            _save_store(store)
            return f"Updated memory entry: {key}"

    store.append({
        "key": key,
        "value": value,
        "tags": tags,
        "created_at": time.time(),
        "updated_at": time.time(),
    })
    _save_store(store)
    return f"Saved memory entry: {key}"


def _search(args: Dict[str, Any]) -> str:
    query = args["query"]
    limit = int(args.get("limit", 5))
    store = _load_store()

    if not store:
        return "No memories found."

    scored = []
    for entry in store:
        key_score = _similarity(query, entry.get("key", ""))
        val_score = _similarity(query, str(entry.get("value", "")))
        tag_score = max(
            (_similarity(query, t) for t in entry.get("tags", [])),
            default=0,
        )
        score = max(key_score, val_score * 0.8, tag_score)
        if score >= SIMILARITY_THRESHOLD:
            scored.append((score, entry))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = scored[:limit]

    if not results:
        return f"No memories matching '{query}'."

    lines = []
    for score, entry in results:
        tags = ", ".join(entry.get("tags", []))
        lines.append(
            f"**{entry['key']}** (score: {score:.2f})\n"
            f"  {entry['value']}"
            + (f"\n  Tags: {tags}" if tags else "")
        )
    return "\n\n".join(lines)


registry.register(Command(
    name="MEMORY_SAVE",
    description=(
        "Save a key-value entry to persistent memory. Use for project conventions, "
        "API patterns, architectural decisions, or anything worth remembering across sessions."
    ),
    args=[
        ArgSchema("key", "string", "Unique identifier for this memory (e.g. 'player_controller_pattern')"),
        ArgSchema("value", "string", "The information to remember"),
        ArgSchema("tags", "string", "Comma-separated tags for categorization (e.g. 'unity,patterns,gameplay')", required=False),
    ],
    executor=_save,
    category="memory",
))

registry.register(Command(
    name="MEMORY_SEARCH",
    description="Search persistent memory by keyword or semantic similarity.",
    args=[
        ArgSchema("query", "string", "Search query"),
        ArgSchema("limit", "integer", "Max number of results (default: 5)", required=False),
    ],
    executor=_search,
    category="memory",
))
