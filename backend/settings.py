"""
Configuration management. Loads from .env and settings.json.
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

# When compiled with PyInstaller (--onefile), __file__ points to a temp dir
# that is deleted on exit. Use %APPDATA%\Unika for all persistent user data.
if getattr(sys, 'frozen', False):
    ROOT_DIR = Path(os.environ.get('APPDATA', Path.home())) / 'Unika'
    ROOT_DIR.mkdir(parents=True, exist_ok=True)
else:
    ROOT_DIR = Path(__file__).parent.parent

DATA_DIR      = ROOT_DIR / "data"
ENV_FILE      = ROOT_DIR / ".env"
SETTINGS_FILE = ROOT_DIR / "settings.json"

DEFAULTS: Dict[str, Any] = {
    "deepseek_api_key": "",
    "tavily_api_key": "",
    "server_port": 8765,
    "unity_bridge_port": 6400,
    "model_default": "deepseek-chat",
    "model_reasoning": "deepseek-reasoner",
    "temperature_v3": 0.3,
    "temperature_r1": 0.6,
    "max_turns": 50,
    "max_history_chars": 80000,
    "compaction_keep_messages": 24,
    "rag_top_k": 5,
    "rag_chunk_size": 512,
    "rag_chunk_overlap": 64,
    "theme": "unity-dark",
    "language": "es",
}


def _load_env() -> None:
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())


def load() -> Dict[str, Any]:
    _load_env()
    settings = dict(DEFAULTS)
    if SETTINGS_FILE.exists():
        try:
            stored = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            settings.update(stored)
        except Exception:
            pass
    # Override from environment variables
    for env_key, settings_key in [
        ("DEEPSEEK_API_KEY", "deepseek_api_key"),
        ("TAVILY_API_KEY", "tavily_api_key"),
    ]:
        val = os.environ.get(env_key, "")
        if val:
            settings[settings_key] = val
    return settings


def save(settings: Dict[str, Any]) -> None:
    SETTINGS_FILE.write_text(
        json.dumps(settings, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def get(key: str, default: Any = None) -> Any:
    return load().get(key, default)
