"""
Unika Backend Server — FastAPI + WebSocket.
This is the main entry point. Runs the Python backend that the Electron frontend connects to.
"""
from __future__ import annotations
import asyncio
import io
import json
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
try:
    from uvicorn.protocols.utils import ClientDisconnected
except ImportError:
    ClientDisconnected = ConnectionResetError  # fallback

# Fix Windows UTF-8 console output
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Ensure project root is in sys.path so `backend.*` imports resolve
# regardless of how/from-where the script is launched.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend import settings as cfg
from backend.events import bus
from backend.unity.bridge import UnityBridge, set_bridge
from backend.projects import manager as project_mgr
from backend.projects import conversations as conv_mgr
from backend.commands.ask import resolve_ask
from backend.commands.doc_editor import set_context_dir
from backend.commands.unity_bridge import set_bridge as set_unity_bridge_cmd
from backend.commands.unity_compile import set_bridge as set_unity_compile_bridge
from backend.agent.core import UAgent
from backend.agent.prompts import (
    WELCOME_MESSAGE,
    SYSTEM_PROMPT_BASE,
    get_system_prompt_base,
    save_system_prompt_override,
    delete_system_prompt_override,
    is_system_prompt_customized,
)

# Active WebSocket clients
_clients: Set[WebSocket] = set()
_clients_lock = asyncio.Lock()

# Active agent instances: {project_id}:{channel_id} → UAgent
_agents: Dict[str, UAgent] = {}
_agent_lock = threading.Lock()

# Message queues for when an agent is already running
_agent_queues: Dict[str, List[str]] = {}
_queue_lock = threading.Lock()

# Active project/channel state per WebSocket client
_client_state: Dict[WebSocket, Dict[str, str]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown."""
    # Set event loop for event bus
    loop = asyncio.get_event_loop()
    bus.set_loop(loop)

    # Start Unity bridge background connector
    bridge = UnityBridge()
    set_bridge(bridge)
    set_unity_bridge_cmd(bridge)
    set_unity_compile_bridge(bridge)
    bridge.start()

    # Register event listener for broadcasting to all WS clients
    def _on_event(event: Dict[str, Any]) -> None:
        asyncio.run_coroutine_threadsafe(_broadcast(event), loop)

    bus.add_listener(_on_event)

    yield

    bridge.stop()
    bus.clear_listeners()


app = FastAPI(title="Unika Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/balance")
def get_balance():
    """Fetch DeepSeek API balance for the configured key."""
    import httpx
    api_key = cfg.get("deepseek_api_key", "")
    if not api_key:
        return JSONResponse({"error": "no_key"}, status_code=200)
    try:
        resp = httpx.get(
            "https://api.deepseek.com/user/balance",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=8,
        )
        if resp.status_code == 200:
            return resp.json()
        return JSONResponse({"error": f"http_{resp.status_code}"}, status_code=200)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=200)


@app.get("/settings")
def get_settings():
    s = cfg.load()
    # Replace actual key values with booleans (set/not set) so the
    # frontend can show status without ever receiving the raw secrets.
    s["deepseek_key_set"] = bool(s.pop("deepseek_api_key", ""))
    s["tavily_key_set"]   = bool(s.pop("tavily_api_key",   ""))
    return s


@app.post("/settings")
def update_settings(body: dict):
    current = cfg.load()
    current.update(body)
    cfg.save(current)
    return {"ok": True}


@app.get("/system-prompt")
def get_system_prompt_endpoint():
    """Return the active system prompt and whether it is customized."""
    # Strip the {context_section} placeholder before sending to the frontend
    content = get_system_prompt_base()
    content_for_ui = content.replace("\n{context_section}", "").replace("{context_section}", "")
    default_for_ui = SYSTEM_PROMPT_BASE.replace("\n{context_section}", "").replace("{context_section}", "")
    return {
        "content": content_for_ui,
        "default": default_for_ui,
        "customized": is_system_prompt_customized(),
    }


@app.post("/system-prompt")
async def save_system_prompt_endpoint(request: Request):
    """Save a custom system prompt override."""
    body = await request.json()
    content = body.get("content", "")
    if not content.strip():
        return JSONResponse({"error": "empty content"}, status_code=400)
    save_system_prompt_override(content)
    return {"ok": True}


@app.delete("/system-prompt")
def reset_system_prompt_endpoint():
    """Delete the custom override and restore the built-in default."""
    deleted = delete_system_prompt_override()
    return {"ok": True, "was_customized": deleted}


@app.get("/projects")
def list_projects():
    return project_mgr.list_projects()


@app.post("/projects")
def create_project(body: dict):
    return project_mgr.create_project(
        name=body.get("name", "New Project"),
        unity_path=body.get("unity_path", ""),
        description=body.get("description", ""),
    )


@app.get("/projects/{project_id}")
def get_project(project_id: str):
    p = project_mgr.get_project(project_id)
    if p is None:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return p


@app.patch("/projects/{project_id}")
def update_project(project_id: str, body: dict):
    p = project_mgr.update_project(project_id, body)
    if p is None:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return p


@app.delete("/projects/{project_id}")
def delete_project(project_id: str):
    ok = project_mgr.delete_project(project_id)
    return {"ok": ok}


@app.get("/projects/{project_id}/channels/{channel_id}/history")
def get_history(project_id: str, channel_id: str):
    return conv_mgr.load_history(project_id, channel_id)


@app.delete("/projects/{project_id}/channels/{channel_id}/history")
def clear_history(project_id: str, channel_id: str):
    conv_mgr.clear_history(project_id, channel_id)
    return {"ok": True}


@app.get("/projects/{project_id}/docs/{doc_name}")
def get_doc(project_id: str, doc_name: str):
    ctx = project_mgr.get_context_dir(project_id)
    name = doc_name if doc_name.endswith(".md") else f"{doc_name}.md"
    path = ctx / name
    return {"content": path.read_text(encoding="utf-8") if path.exists() else ""}


@app.post("/projects/{project_id}/docs/{doc_name}")
def save_doc(project_id: str, doc_name: str, body: dict):
    """Silent REST save — does NOT trigger the agent."""
    ctx = project_mgr.get_context_dir(project_id)
    name = doc_name if doc_name.endswith(".md") else f"{doc_name}.md"
    path = ctx / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.get("content", ""), encoding="utf-8")
    return {"ok": True}


@app.get("/projects/{project_id}/channels/{channel_id}/context-breakdown")
def get_context_breakdown(project_id: str, channel_id: str):
    """Return a token-level breakdown of everything that goes into the agent context."""
    import json as _json
    from backend.projects import conversations as conv_mgr
    from backend.agent.prompts import get_system_prompt_base

    ctx_dir = project_mgr.get_context_dir(project_id)
    history = conv_mgr.load_history(project_id, channel_id)

    def est_tokens(text: str) -> int:
        return max(1, len(text) // 4)

    # ── System prompt base (strip dynamic placeholder) ────────────────────────
    sys_base = get_system_prompt_base()
    sys_base = sys_base.replace("\n{context_section}", "").replace("{context_section}", "")

    # ── Context files injected into the prompt ────────────────────────────────
    CONTEXT_FILES = [
        ("GAME_CONTEXT.md", "Contexto",     3000),
        ("TDD.md",          "TDD",          3000),
        ("GDD.md",          "GDD",          3000),
        ("MEMORY.md",       "Memoria",      2000),
        ("SESSION_LOG.md",  "Log de sesión", 1500),
    ]
    context_sections = []
    for filename, label, limit in CONTEXT_FILES:
        path = ctx_dir / filename
        if path.exists():
            raw = path.read_text(encoding="utf-8")
            used = raw[:limit]
            context_sections.append({
                "id": filename.replace(".md", "").lower(),
                "label": label,
                "chars": len(used),
                "chars_total": len(raw),
                "tokens": est_tokens(used),
                "truncated": len(raw) > limit,
            })
        else:
            context_sections.append({
                "id": filename.replace(".md", "").lower(),
                "label": label,
                "chars": 0,
                "chars_total": 0,
                "tokens": 0,
                "truncated": False,
            })

    # ── Conversation history ──────────────────────────────────────────────────
    history_items = []
    for msg in history:
        role = msg.get("role", "")
        content = msg.get("content", "") or ""
        if isinstance(content, list):
            content = " ".join(str(c) for c in content)
        msg_json = _json.dumps(msg, ensure_ascii=False)
        preview = str(content)[:120].replace("\n", " ").strip()
        history_items.append({
            "role": role,
            "preview": preview,
            "chars": len(msg_json),
            "tokens": est_tokens(msg_json),
            "has_tools": bool(msg.get("tool_calls")),
        })

    sp_tokens      = est_tokens(sys_base)
    context_tokens = sum(s["tokens"] for s in context_sections)
    history_tokens = sum(i["tokens"] for i in history_items)
    total_tokens   = sp_tokens + context_tokens + history_tokens

    return {
        "total_tokens":    total_tokens,
        "context_window":  65536,
        "system_prompt": {
            "label":  "System Prompt",
            "chars":  len(sys_base),
            "tokens": sp_tokens,
        },
        "context_files": context_sections,
        "history": {
            "label":  "Historial",
            "tokens": history_tokens,
            "items":  history_items,
        },
    }


@app.get("/projects/{project_id}/board")
def get_board(project_id: str):
    context_dir = project_mgr.get_context_dir(project_id)
    board_path = context_dir / "BOARD.json"
    if not board_path.exists():
        return {
            "columns": [
                {"id": "todo",       "title": "Por hacer",   "cards": []},
                {"id": "inprogress", "title": "En progreso", "cards": []},
                {"id": "done",       "title": "Hecho",       "cards": []},
            ]
        }
    try:
        return json.loads(board_path.read_text(encoding="utf-8"))
    except Exception:
        return {"columns": []}


@app.post("/projects/{project_id}/board")
async def save_board(project_id: str, request: Request):
    body = await request.json()
    context_dir = project_mgr.get_context_dir(project_id)
    board_path = context_dir / "BOARD.json"
    board_path.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


@app.get("/projects/{project_id}/assets")
def get_assets(project_id: str):
    """Return asset list: tries Unity bridge first, falls back to filesystem scan."""
    project = project_mgr.get_project(project_id)
    unity_path = (project or {}).get("unity_path", "")

    # Try Unity bridge
    try:
        from backend.commands import registry
        result = registry.execute("UNITY_GET_ASSETS", {"path": "Assets", "recursive": True})
        if result and not isinstance(result, str):
            return {"assets": result if isinstance(result, list) else []}
        parsed = json.loads(result) if isinstance(result, str) else []
        if parsed:
            return {"assets": parsed}
    except Exception:
        pass

    # Fallback: scan filesystem
    assets = []
    if unity_path:
        assets_root = Path(unity_path) / "Assets"
        if assets_root.exists():
            ext_type = {
                ".cs": "script", ".prefab": "prefab", ".mat": "material",
                ".png": "texture", ".jpg": "texture", ".jpeg": "texture",
                ".psd": "texture", ".tga": "texture", ".exr": "texture",
                ".unity": "scene", ".mp3": "audio", ".wav": "audio", ".ogg": "audio",
                ".anim": "animation", ".controller": "animator",
                ".shader": "shader", ".hlsl": "shader", ".cginc": "shader",
                ".asset": "asset",
            }
            for p in assets_root.rglob("*"):
                if p.suffix == ".meta" or not p.is_file():
                    continue
                rel = p.relative_to(assets_root).as_posix()
                assets.append({
                    "path": f"Assets/{rel}",
                    "name": p.stem,
                    "ext": p.suffix.lstrip("."),
                    "type": ext_type.get(p.suffix.lower(), "file"),
                })
    return {"assets": assets}


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    async with _clients_lock:
        _clients.add(websocket)
    _client_state[websocket] = {"project_id": "", "channel_id": "general"}

    try:
        # Send welcome
        await websocket.send_json({
            "type": "welcome",
            "message": WELCOME_MESSAGE,
            "projects": project_mgr.list_projects(),
        })

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            await _handle_ws_message(websocket, msg)
    except (WebSocketDisconnect, ClientDisconnected):
        pass  # Client disconnected (HMR reload, tab close, etc.) — not an error
    finally:
        async with _clients_lock:
            _clients.discard(websocket)
        _client_state.pop(websocket, None)


async def _handle_ws_message(ws: WebSocket, msg: Dict[str, Any]) -> None:
    t = msg.get("type", "")
    state = _client_state.get(ws, {})

    if t == "select_project":
        project_id = msg.get("project_id", "")
        channel_id = msg.get("channel_id", "general")
        state["project_id"] = project_id
        state["channel_id"] = channel_id
        _client_state[ws] = state

        # Update doc editor context
        if project_id:
            set_context_dir(project_mgr.get_context_dir(project_id))

        # Load history and send to client
        history = conv_mgr.load_history(project_id, channel_id)
        await ws.send_json({
            "type": "history_loaded",
            "project_id": project_id,
            "channel_id": channel_id,
            "messages": history,
        })

    elif t == "user_message":
        project_id = state.get("project_id", "")
        channel_id = state.get("channel_id", "general")
        text = msg.get("text", "").strip()
        if not text:
            return

        # Save user message to history
        conv_mgr.append_message(project_id, channel_id, "user", text)
        await ws.send_json({"type": "message_ack", "role": "user", "content": text})

        planning_mode = bool(msg.get("planning_mode", False))

        # Get or create agent
        agent_key = f"{project_id}:{channel_id}"
        with _agent_lock:
            if agent_key not in _agents:
                project = project_mgr.get_project(project_id) if project_id else None
                new_agent = UAgent(
                    project_name=project["name"] if project else None,
                    unity_path=project.get("unity_path") if project else None,
                    context_dir=project_mgr.get_context_dir(project_id) if project_id else None,
                    active_model=project.get("active_model", cfg.get("model_default")) if project else cfg.get("model_default"),
                    channel=channel_id,
                    planning_mode=planning_mode,
                )
                # Restore conversation context so the agent remembers previous turns
                persisted = conv_mgr.load_history(project_id, channel_id)
                if persisted:
                    new_agent.load_history(persisted)
                _agents[agent_key] = new_agent
            agent = _agents[agent_key]
            agent.planning_mode = planning_mode
            # Apply context flags sent by frontend (ensures persisted flags sync on agent creation)
            context_flags = msg.get("context_flags")
            if context_flags and isinstance(context_flags, dict):
                agent.set_context_flags(context_flags)

        # If agent is already running, queue this message
        if agent._running:
            with _queue_lock:
                _agent_queues.setdefault(agent_key, []).append(text)
            await ws.send_json({"type": "message_queued", "text": text})
            return

        # Run agent in background thread (with queue drain on completion)
        def _run():
            response = agent.run(text)
            if response:  # skip saving empty responses (e.g. plan cancelled)
                conv_mgr.append_message(project_id, channel_id, "assistant", response)
            # If the run was interrupted (user pressed stop), discard any queued
            # messages — they were queued against a mid-task state and would run
            # on an already-cleaned history, causing confusion.
            if agent._stop_requested:
                with _queue_lock:
                    _agent_queues.pop(agent_key, None)
                return
            # Drain any messages queued while agent was running
            while True:
                with _queue_lock:
                    q = _agent_queues.get(agent_key, [])
                    if not q:
                        break
                    next_text = q.pop(0)
                    _agent_queues[agent_key] = q
                next_response = agent.run(next_text)
                conv_mgr.append_message(project_id, channel_id, "assistant", next_response)

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

    elif t == "ask_response":
        ask_id = msg.get("id", "")
        answers = msg.get("answers", [])
        resolve_ask(ask_id, answers)

    elif t == "set_model":
        project_id = state.get("project_id", "")
        channel_id = state.get("channel_id", "general")
        model = msg.get("model", "deepseek-chat")
        agent_key = f"{project_id}:{channel_id}"
        with _agent_lock:
            if agent_key in _agents:
                _agents[agent_key].set_model(model)
        if project_id:
            project_mgr.update_project(project_id, {"active_model": _agents.get(agent_key, UAgent()).active_model})
        await ws.send_json({"type": "model_changed", "model": model})

    elif t == "stop":
        project_id = state.get("project_id", "")
        channel_id = state.get("channel_id", "general")
        agent_key = f"{project_id}:{channel_id}"
        with _agent_lock:
            agent = _agents.get(agent_key)
        if agent:
            agent.request_stop()

    elif t == "cancel_queued":
        project_id = state.get("project_id", "")
        channel_id = state.get("channel_id", "general")
        agent_key = f"{project_id}:{channel_id}"
        text_to_cancel = msg.get("text", "")
        with _queue_lock:
            q = _agent_queues.get(agent_key, [])
            if text_to_cancel in q:
                q.remove(text_to_cancel)
                _agent_queues[agent_key] = q
                await ws.send_json({"type": "queue_item_cancelled", "text": text_to_cancel})

    elif t == "truncate_history":
        # Frontend sends all messages to KEEP (up to but not including the edited message)
        project_id = state.get("project_id", "")
        channel_id = state.get("channel_id", "general")
        keep_messages = msg.get("messages", [])  # list of {role, content}
        agent_key = f"{project_id}:{channel_id}"
        with _agent_lock:
            agent = _agents.get(agent_key)
        if agent and not agent._running:
            agent.clear_history()
            if keep_messages:
                agent.load_history(keep_messages)
            await ws.send_json({"type": "history_truncated"})

    elif t == "set_context_flags":
        project_id = state.get("project_id", "")
        channel_id = state.get("channel_id", "general")
        flags = msg.get("flags", {})
        agent_key = f"{project_id}:{channel_id}"
        with _agent_lock:
            agent = _agents.get(agent_key)
        if agent:
            agent.set_context_flags(flags)

    elif t == "clear_history":
        project_id = state.get("project_id", "")
        channel_id = state.get("channel_id", "general")
        conv_mgr.clear_history(project_id, channel_id)
        agent_key = f"{project_id}:{channel_id}"
        with _agent_lock:
            _agents.pop(agent_key, None)
        await ws.send_json({"type": "history_cleared"})

    elif t == "create_channel":
        project_id = state.get("project_id", "")
        name = msg.get("name", "nueva").strip()
        if not name:
            return
        conv_id = name.lower().replace(" ", "-")
        project = project_mgr.add_conversation(project_id, name)
        # Auto-select the new conversation
        state["channel_id"] = conv_id
        _client_state[ws] = state
        await ws.send_json({
            "type": "project_updated",
            "project": project,
            "new_conversation_id": conv_id,
        })

    elif t == "open_project":
        unity_path = msg.get("unity_path", "").strip()
        if not unity_path:
            await ws.send_json({"type": "error", "message": "Ruta del proyecto no proporcionada"})
            return
        project = project_mgr.open_project(unity_path)
        project_id = project["id"]
        conv_id = project.get("active_conversation") or ""

        state["project_id"] = project_id
        state["channel_id"] = conv_id
        _client_state[ws] = state

        set_context_dir(project_mgr.get_context_dir(project_id))

        history = conv_mgr.load_history(project_id, conv_id)
        await ws.send_json({
            "type": "project_opened",
            "project": project,
            "conversation_id": conv_id,
            "projects": project_mgr.list_projects(),
        })
        if history:
            await ws.send_json({
                "type": "history_loaded",
                "project_id": project_id,
                "channel_id": conv_id,
                "messages": history,
            })

        # Auto-import: install plugin + start RAG indexing in background
        def _auto_import():
            from pathlib import Path as _Path
            import shutil as _shutil

            # 1. Auto-install Unity plugin (only if not already present)
            plugin_marker = _Path(unity_path) / ".unika" / "plugin_installed"
            dest_dir = _Path(unity_path) / "Assets" / "Editor" / "Unika"
            plugin_src = _Path(__file__).parent.parent / "unity-plugin" / "Editor" / "Unika"
            if not plugin_marker.exists() and plugin_src.exists() and (_Path(unity_path) / "Assets").exists():
                try:
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    copied = []
                    for src_file in plugin_src.glob("*.cs"):
                        _shutil.copy2(src_file, dest_dir / src_file.name)
                        copied.append(src_file.name)
                    if copied:
                        plugin_marker.parent.mkdir(parents=True, exist_ok=True)
                        plugin_marker.write_text("\n".join(copied))
                        bus.emit({"type": "plugin_installed", "project_id": project_id, "files": copied})
                except Exception as e:
                    bus.emit({"type": "plugin_install_error", "project_id": project_id, "error": str(e)})

            # 2. Start RAG indexing
            try:
                from backend.rag import indexer as rag_indexer
                bus.emit({"type": "rag_indexing_started", "project_id": project_id})
                rag_indexer.start_watching(project_id, unity_path)
                bus.emit({"type": "rag_indexing_done", "project_id": project_id})
            except Exception as e:
                bus.emit({"type": "rag_indexing_error", "project_id": project_id, "error": str(e)})

        threading.Thread(target=_auto_import, daemon=True, name=f"auto_import_{project_id}").start()

    elif t == "create_project":
        project = project_mgr.create_project(
            name=msg.get("name", "Nuevo Proyecto"),
            unity_path=msg.get("unity_path", ""),
        )
        await ws.send_json({"type": "project_created", "project": project})
        await _broadcast({"type": "projects_updated", "projects": project_mgr.list_projects()})

    elif t == "ping":
        await ws.send_json({"type": "pong"})


async def _broadcast(event: Dict[str, Any]) -> None:
    async with _clients_lock:
        clients = list(_clients)
    dead = []
    for ws in clients:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    if dead:
        async with _clients_lock:
            for ws in dead:
                _clients.discard(ws)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    import socket
    port = cfg.get("server_port", 8765)
    # Check if port is already in use before starting
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if s.connect_ex(('127.0.0.1', port)) == 0:
            print(f"[ERROR] Port {port} already in use. Another backend instance is running.", flush=True)
            sys.exit(1)
    print(f"Unika backend starting on port {port}...", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
