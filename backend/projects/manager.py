"""
Project manager — CRUD for Unika projects.
Each project is a Unity project directory. Metadata is stored in data/projects/{id}/metadata.json.
Context files (GDD.md, TDD.md, etc.) live inside the Unity project at .unika/.
"""
from __future__ import annotations
import hashlib
import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend import settings as cfg

PROJECTS_DIR = cfg.DATA_DIR / "projects"


def _meta_path(project_id: str) -> Path:
    return PROJECTS_DIR / project_id / "metadata.json"


def get_context_dir(project_id: str) -> Path:
    """Context files live in {unity_path}/.unika/ when a Unity path is set."""
    meta = get_project(project_id)
    if meta and meta.get("unity_path"):
        ctx = Path(meta["unity_path"]) / ".unika"
        ctx.mkdir(parents=True, exist_ok=True)
        return ctx
    fallback = PROJECTS_DIR / project_id / "context"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


def open_project(unity_path: str) -> Dict[str, Any]:
    """Open or create a project linked to a Unity project directory.
    The project ID is a stable hash of the path so the same folder always maps to the same project.
    """
    unity_path = str(Path(unity_path).resolve())
    project_id = "u" + hashlib.md5(unity_path.encode()).hexdigest()[:7]

    existing = get_project(project_id)
    if existing:
        _init_context_files(unity_path, existing["name"])
        return existing

    name = Path(unity_path).name
    return _create_project_with_id(name, unity_path, project_id)


def create_project(
    name: str,
    unity_path: str = "",
    description: str = "",
) -> Dict[str, Any]:
    project_id = str(uuid.uuid4())[:8]
    return _create_project_with_id(name, unity_path, project_id, description)


def _create_project_with_id(
    name: str,
    unity_path: str,
    project_id: str,
    description: str = "",
) -> Dict[str, Any]:
    now = time.time()
    meta = {
        "id": project_id,
        "name": name,
        "unity_path": unity_path,
        "description": description,
        "created_at": now,
        "updated_at": now,
        "conversations": [],
        "active_conversation": "",
        "active_model": cfg.get("model_default", "deepseek-chat"),
    }
    path = PROJECTS_DIR / project_id
    path.mkdir(parents=True, exist_ok=True)
    _meta_path(project_id).write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    if unity_path:
        _init_context_files(unity_path, name)
    return meta


def _init_context_files(unity_path: str, project_name: str) -> None:
    """Create starter context files in {unity_path}/.unika/ if they don't exist."""
    if not unity_path:
        return
    ctx = Path(unity_path) / ".unika"
    ctx.mkdir(parents=True, exist_ok=True)

    if not (ctx / "GDD.md").exists():
        (ctx / "GDD.md").write_text(
            f"# {project_name} — Game Design Document\n\n"
            "## Concepto\n\n_Describe aquí el concepto del juego._\n\n"
            "## Mecánicas principales\n\n_Lista las mecánicas core._\n\n"
            "## Historia y mundo\n\n_Describe el mundo y la narrativa._\n",
            encoding="utf-8",
        )
    if not (ctx / "TDD.md").exists():
        (ctx / "TDD.md").write_text(
            f"# {project_name} — Technical Design Document\n\n"
            "_Este documento se actualiza automáticamente por Unika tras cada implementación._\n\n"
            "## Sistemas implementados\n\n_Ninguno aún._\n\n"
            "## Arquitectura\n\n_Pendiente._\n",
            encoding="utf-8",
        )
    if not (ctx / "GAME_CONTEXT.md").exists():
        (ctx / "GAME_CONTEXT.md").write_text(
            f"# {project_name} — Contexto del Juego\n\n_Estado general del proyecto._\n",
            encoding="utf-8",
        )
    if not (ctx / "MEMORY.md").exists():
        (ctx / "MEMORY.md").write_text(
            f"# {project_name} — Memoria del Agente\n\n"
            "_Decisiones importantes y convenciones del proyecto._\n",
            encoding="utf-8",
        )
    if not (ctx / "SESSION_LOG.md").exists():
        (ctx / "SESSION_LOG.md").write_text(
            f"# {project_name} — Log de Sesiones\n\n",
            encoding="utf-8",
        )


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    path = _meta_path(project_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def update_project(project_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    meta = get_project(project_id)
    if meta is None:
        return None
    meta.update(updates)
    meta["updated_at"] = time.time()
    _meta_path(project_id).write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return meta


def delete_project(project_id: str) -> bool:
    import shutil
    path = PROJECTS_DIR / project_id
    if not path.exists():
        return False
    shutil.rmtree(path)
    return True


def list_projects() -> List[Dict[str, Any]]:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    projects = []
    for d in sorted(PROJECTS_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if d.is_dir() and (d / "metadata.json").exists():
            p = get_project(d.name)
            if p:
                projects.append(p)
    return projects


def add_conversation(project_id: str, name: str) -> Optional[Dict[str, Any]]:
    meta = get_project(project_id)
    if meta is None:
        return None
    conv_id = name.lower().replace(" ", "-")
    conversations: List[Dict] = meta.get("conversations", [])
    if any(c["id"] == conv_id for c in conversations):
        return meta
    conversations.append({"id": conv_id, "name": name})
    return update_project(project_id, {"conversations": conversations})


# Alias for backward compat
def add_channel(project_id: str, name: str) -> Optional[Dict[str, Any]]:
    return add_conversation(project_id, name)


def delete_conversation(project_id: str, conv_id: str) -> Optional[Dict[str, Any]]:
    meta = get_project(project_id)
    if meta is None:
        return None
    conversations = [c for c in meta.get("conversations", []) if c["id"] != conv_id]
    return update_project(project_id, {"conversations": conversations})
