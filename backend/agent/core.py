"""
Unika agent core — turn-based execution loop.
Handles DeepSeek V3 and R1, streaming, tool dispatch, context management,
history compaction, and session logging.
"""
from __future__ import annotations
import json
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend import settings as cfg
from backend.agent import models, prompts
from backend.commands import registry
from backend.commands.ask import resolve_ask
from backend.events import bus


MAX_TURNS = 50
MAX_HISTORY_CHARS = 80_000
COMPACTION_KEEP = 24  # messages to keep after compaction

COMPRESS_THRESHOLD = 60
COMPRESS_KEEP_TAIL = 20


class UAgent:
    """
    Stateful agent instance for one project/conversation.
    One instance per active conversation channel.
    """

    def __init__(
        self,
        project_name: Optional[str] = None,
        unity_path: Optional[str] = None,
        context_dir: Optional[Path] = None,
        active_model: str = "deepseek-chat",
        channel: str = "main",
        planning_mode: bool = False,
        _allowed_tools: list | None = None,
        _system_prompt_override: str | None = None,
        _parent_stop_fn: Optional[Any] = None,
        _context_flags: Optional[Dict[str, bool]] = None,
    ):
        self.project_name = project_name
        self.unity_path = unity_path
        self.context_dir = context_dir
        self.active_model = active_model
        self.channel = channel
        self.planning_mode = planning_mode
        self._allowed_tools = _allowed_tools
        self._system_prompt_override = _system_prompt_override
        self._parent_stop_fn = _parent_stop_fn  # callable() → bool for stop propagation
        self._context_flags: Dict[str, bool] = _context_flags or {
            "game_context": True,
            "tdd": True,
            "gdd": True,
            "memory": True,
            "logs": True,
            "board": False,
        }
        self._history: List[Dict[str, Any]] = []
        self._running = False
        self._stop_requested = False
        self._lock = threading.Lock()
        self._current_message_id: str = ""

    # ------------------------------------------------------------------
    # Sub-agent configuration
    # ------------------------------------------------------------------

    _SUBAGENT_TOOLS = {
        "coder":    {"FILE_READ", "FILE_WRITE", "FILE_EDIT", "UNITY_COMPILE", "UNITY_READ_CONSOLE"},
        "planner":  {"FILE_READ"},
        "search":   {"SEARCH", "FILE_READ"},
        "reasoner": set(),   # R1 — pure reasoning, no tool calls
        "reviewer": {"FILE_READ", "UNITY_COMPILE", "UNITY_READ_CONSOLE"},
    }

    _SUBAGENT_PROMPTS = {
        "coder": (
            "You are a specialist C# Unity coder sub-agent. "
            "Your ONLY job is to write or edit C# code as instructed. "
            "Always run the compile-check cycle after writing C# (UNITY_COMPILE → wait 6s → UNITY_READ_CONSOLE). "
            "Return a concise 1-2 sentence summary of what was done and whether it compiled."
        ),
        "planner": (
            "You are a planning sub-agent. Analyze the request and return a structured plan. "
            "Use a ```gui plan_board``` block to list the steps. "
            "Do NOT execute any actions — only plan and return the plan."
        ),
        "search": (
            "You are a research sub-agent for Unity game development. "
            "Search for relevant information and return a structured summary of your findings. "
            "Be concise and focused on actionable information."
        ),
        "reasoner": (
            "You are a deep reasoning sub-agent. Your purpose is to think through complex "
            "problems carefully and return a clear, actionable conclusion.\n"
            "Process:\n"
            "1. Fully understand the problem and its constraints.\n"
            "2. Consider all relevant approaches or possibilities.\n"
            "3. Reason step by step, evaluating trade-offs.\n"
            "4. Conclude with a definitive recommendation that the main agent can act on directly.\n"
            "Format: short reasoning summary + ONE clear conclusion sentence starting with "
            "'CONCLUSION:'. Be direct and specific — avoid vague answers."
        ),
        "reviewer": (
            "You are a code review sub-agent for Unity C# projects. "
            "Your job is to verify that recently written or modified C# files are correct, "
            "compile cleanly, and follow Unity best practices.\n"
            "Process:\n"
            "1. Read the specified files.\n"
            "2. Run UNITY_COMPILE and wait 6 seconds.\n"
            "3. Read the console (filter: error).\n"
            "4. If there are errors: read the failing files, fix them, re-compile (up to 3 iterations).\n"
            "5. Check for common issues: missing null checks, Update() allocations, incorrect lifecycle usage.\n"
            "Return a concise verdict: APPROVED (no issues), FIXED (errors corrected, list what changed), "
            "or FAILED (unfixable errors, explain why)."
        ),
    }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def set_context_flags(self, flags: Dict[str, bool]) -> None:
        """Update which context files are injected into the system prompt."""
        self._context_flags.update(flags)

    def set_model(self, model: str) -> None:
        """Switch between 'deepseek-chat' (V3) and 'deepseek-reasoner' (R1)."""
        valid = {cfg.get("model_default", "deepseek-chat"), cfg.get("model_reasoning", "deepseek-reasoner")}
        valid.update({"deepseek-chat", "deepseek-reasoner", "v3", "r1"})
        aliases = {"v3": "deepseek-chat", "r1": "deepseek-reasoner"}
        self.active_model = aliases.get(model.lower(), model)

    def request_stop(self) -> None:
        self._stop_requested = True

    def _is_stopped(self) -> bool:
        """True if this agent OR its parent has requested a stop."""
        return self._stop_requested or bool(
            self._parent_stop_fn is not None and self._parent_stop_fn()
        )

    def clear_history(self) -> None:
        self._history.clear()

    def load_history(self, messages: List[Dict[str, Any]]) -> None:
        """Restore conversation context from persisted messages (called on agent creation)."""
        self._history = [
            {"role": m["role"], "content": m["content"]}
            for m in messages
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]

    def run(self, user_message: str) -> str:
        """
        Run a user message through the agent loop.
        Returns the final assistant response.
        Emits events for streaming tokens and tool execution.
        """
        with self._lock:
            self._running = True
            self._stop_requested = False

        try:
            return self._run_loop(user_message)
        finally:
            with self._lock:
                self._running = False

    # ------------------------------------------------------------------
    # Internal loop
    # ------------------------------------------------------------------

    def _run_loop(self, user_message: str) -> str:
        self._current_message_id = str(uuid.uuid4())
        is_r1 = "reasoner" in self.active_model

        # Build system prompt
        system_prompt = self._build_system_prompt()
        tools = self._allowed_tools if self._allowed_tools is not None else registry.to_openai_tools()

        # Prepare messages
        if is_r1:
            # R1: no system role — inject as first user message
            if not self._history:
                first_msg = prompts.build_r1_first_message(
                    system_prompt=system_prompt,
                    rag_context=self._get_rag_context(user_message),
                    project_context="",
                    user_message=user_message,
                )
                self._history.append({"role": "user", "content": first_msg})
            else:
                self._history.append({"role": "user", "content": user_message})
            messages = self._history
        else:
            # V3: system prompt + conversation history
            self._history.append({"role": "user", "content": user_message})
            messages = [{"role": "system", "content": system_prompt}] + self._history

        # Planning mode: emit a plan_board, then ask confirmation before acting
        if self.planning_mode:
            self._planning_step(user_message, system_prompt)
            import time as _time; _time.sleep(0.3)
            if not self._ask_plan_confirmation():
                bus.emit({"type": "task_interrupted", "channel": self.channel})
                bus.emit({"type": "task_done", "message": "", "channel": self.channel, "cancelled": True})
                return ""

        final_response = ""

        for turn in range(1, MAX_TURNS + 1):
            # Compress history if it has grown too large
            self._maybe_compress_history()
            if self._is_stopped():
                bus.emit({"type": "task_interrupted", "channel": self.channel})
                break

            bus.emit({"type": "turn_start", "turn": turn, "model": self.active_model, "channel": self.channel})

            # Call DeepSeek (pass stop_fn so the stream can be interrupted per-token)
            try:
                text, tool_calls = models.stream_completion(
                    messages=messages,
                    model=self.active_model,
                    tools=tools if not is_r1 else None,  # R1 doesn't support function calling
                    stop_fn=lambda: self._is_stopped(),
                    channel=self.channel,
                    message_id=self._current_message_id,
                )
            except Exception as e:
                # Remove the user message added before the failed call so history stays clean
                if self._history and self._history[-1].get("role") == "user":
                    self._history.pop()
                # Send to debug panel only — never surface to the user
                bus.emit({
                    "type": "api_error",
                    "channel": self.channel,
                    "message": str(e),
                    "timestamp_ms": int(time.time() * 1000),
                })
                bus.emit({"type": "task_done", "message": "", "channel": self.channel})
                return ""

            # Add assistant turn to history
            assistant_msg: Dict[str, Any] = {"role": "assistant", "content": text}
            if tool_calls:
                assistant_msg["tool_calls"] = tool_calls
            self._history.append(assistant_msg)
            if not is_r1:
                messages = [{"role": "system", "content": system_prompt}] + self._history

            bus.emit({"type": "message_end", "text": text, "channel": self.channel})

            # If stop was requested during streaming, bail out now
            if self._is_stopped():
                bus.emit({"type": "task_interrupted", "channel": self.channel})
                final_response = text
                break

            # No tool calls → final response
            if not tool_calls:
                final_response = text
                break

            # Execute tool calls
            tool_results = self._execute_tools(tool_calls)

            # Add tool results to history
            for res in tool_results:
                self._history.append(res)
            if not is_r1:
                messages = [{"role": "system", "content": system_prompt}] + self._history

            # Compact history if too long
            messages = self._maybe_compact(messages, system_prompt if not is_r1 else None)

        else:
            bus.emit({"type": "max_turns_reached", "channel": self.channel})
            final_response = self._history[-1].get("content", "") if self._history else ""

        if self._stop_requested:
            # Remove any dangling assistant+tool_calls from history that have no
            # corresponding tool results — otherwise the next run will send a
            # malformed conversation to the API.
            self._cleanup_dangling_history()

        bus.emit({"type": "task_done", "message": final_response, "channel": self.channel})

        # Auto-save session log entry
        self._append_session_log(user_message, final_response)

        return final_response

    # File-mutating tools that participate in atomic snapshot/restore
    _WRITE_TOOLS = {"FILE_WRITE", "FILE_EDIT", "FILE_EDIT_SECTION", "FILE_APPEND"}

    def _execute_tools(self, tool_calls: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if self._is_stopped():
            return []

        from backend.commands import subagents as _subagents_mod

        # ── Atomic snapshot: capture current content of every file that will be mutated ──
        snapshots: Dict[str, Optional[str]] = {}
        for tc in tool_calls:
            fn = tc.get("function", {})
            if fn.get("name") in self._WRITE_TOOLS:
                try:
                    import json as _j
                    a = _j.loads(fn.get("arguments", "{}"))
                    p = Path(a.get("path", ""))
                    if str(p) not in snapshots:
                        snapshots[str(p)] = p.read_text(encoding="utf-8") if p.exists() else None
                except Exception:
                    pass

        def _run_one(tc):
            _subagents_mod.set_current_agent(self)  # thread-local, safe for parallel use
            if self._is_stopped():
                return {"role": "tool", "tool_call_id": tc.get("id", ""), "content": "[STOP]"}
            fn = tc.get("function", {})
            name = fn.get("name", "")
            try:
                import json as _json
                args = _json.loads(fn.get("arguments", "{}"))
            except Exception:
                args = {}

            bus.emit({"type": "command_start", "channel": self.channel, "id": tc.get("id", ""), "name": name, "args": args})
            t0 = time.time()
            result = registry.execute(name, args)
            duration_ms = int((time.time() - t0) * 1000)
            is_error = str(result).startswith("[ERROR]") or str(result).startswith("[Unity Error]")
            bus.emit({"type": "command_result", "channel": self.channel, "id": tc.get("id", ""), "name": name, "result": result, "duration_ms": duration_ms, "error": is_error})
            return {"role": "tool", "tool_call_id": tc.get("id", ""), "content": str(result)}

        if len(tool_calls) == 1:
            results = [_run_one(tool_calls[0])]
        else:
            results_map: dict = {}
            with ThreadPoolExecutor(max_workers=min(len(tool_calls), 6)) as pool:
                futures = {pool.submit(_run_one, tc): i for i, tc in enumerate(tool_calls)}
                for future in as_completed(futures):
                    idx = futures[future]
                    results_map[idx] = future.result()
            results = [results_map[i] for i in range(len(tool_calls))]

        # ── Atomic restore: if any write tool errored, roll back all snapshotted files ──
        if snapshots:
            has_error = any(
                str(r.get("content", "")).startswith("[ERROR]")
                for r in results
            )
            if has_error:
                restored = 0
                for path_str, original in snapshots.items():
                    try:
                        p = Path(path_str)
                        if original is None:
                            if p.exists():
                                p.unlink()
                        else:
                            p.write_text(original, encoding="utf-8")
                        restored += 1
                    except Exception:
                        pass
                if restored:
                    bus.emit({"type": "files_restored", "channel": self.channel, "count": restored})

        return results

    def _build_system_prompt(self) -> str:
        if self._system_prompt_override is not None:
            return self._system_prompt_override
        game_context = ""
        tdd_summary = ""
        gdd_content = ""
        memory_content = ""
        logs_content = ""
        if self.context_dir:
            flags = self._context_flags
            if flags.get("game_context", True):
                gc_path = self.context_dir / "GAME_CONTEXT.md"
                if gc_path.exists():
                    game_context = gc_path.read_text(encoding="utf-8")[:3000]
            if flags.get("tdd", True):
                tdd_path = self.context_dir / "TDD.md"
                if tdd_path.exists():
                    tdd_summary = tdd_path.read_text(encoding="utf-8")[:3000]
            if flags.get("gdd", True):
                gdd_path = self.context_dir / "GDD.md"
                if gdd_path.exists():
                    gdd_content = gdd_path.read_text(encoding="utf-8")[:3000]
            if flags.get("memory", True):
                mem_path = self.context_dir / "MEMORY.md"
                if mem_path.exists():
                    memory_content = mem_path.read_text(encoding="utf-8")[:2000]
            if flags.get("logs", True):
                log_path = self.context_dir / "SESSION_LOG.md"
                if log_path.exists():
                    logs_content = log_path.read_text(encoding="utf-8")[:1500]

        board_summary = ""
        if self.context_dir:
            flags = self._context_flags
            if flags.get("board", False):
                board_path = self.context_dir / "BOARD.json"
                if board_path.exists():
                    try:
                        import json as _json
                        board_data = _json.loads(board_path.read_text(encoding="utf-8"))
                        lines = ["### Kanban Board"]
                        for col in board_data.get("columns", []):
                            lines.append(f"\n**{col['title']}** ({len(col.get('cards', []))} tarjetas)")
                            for card in col.get("cards", []):
                                tags_str = f" [{', '.join(card['tags'])}]" if card.get("tags") else ""
                                lines.append(f"  - {card['title']}{tags_str}")
                        board_summary = "\n".join(lines)
                    except Exception:
                        pass

        from backend.unity.bridge import get_bridge
        bridge = get_bridge()
        unity_connected = bridge.is_connected if bridge else False

        # Rough token estimate: history chars / 4 (common approximation)
        estimated_tokens = sum(len(json.dumps(m)) for m in self._history) // 4

        return prompts.build_system_prompt(
            project_name=self.project_name,
            unity_path=self.unity_path,
            unity_connected=unity_connected,
            active_model=self.active_model,
            game_context=game_context,
            tdd_summary=tdd_summary,
            gdd_content=gdd_content,
            memory_content=memory_content,
            logs_content=logs_content,
            rag_context=self._get_rag_context(""),
            estimated_tokens=estimated_tokens,
            board_summary=board_summary,
        )

    def _get_rag_context(self, query: str) -> str:
        """Query RAG for relevant code context. Returns empty string if RAG not initialized."""
        if not query:
            return ""
        try:
            from backend.rag.retriever import retrieve
            results = retrieve(query, top_k=cfg.get("rag_top_k", 5))
            if not results:
                return ""
            lines = []
            for r in results:
                lines.append(f"// {r['file']} (line {r.get('start_line', '?')})\n{r['content']}")
            return "\n\n---\n\n".join(lines)
        except Exception:
            return ""

    def _maybe_compact(
        self, messages: List[Dict[str, Any]], system_msg: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        total_chars = sum(len(json.dumps(m)) for m in messages)
        if total_chars <= MAX_HISTORY_CHARS:
            return messages

        # Keep system + last N messages
        non_system = [m for m in messages if m.get("role") != "system"]
        keep = non_system[-COMPACTION_KEEP:]

        # Don't start with a tool message (orphaned tool result)
        while keep and keep[0].get("role") == "tool":
            keep = keep[1:]
        # Start with a user message
        while keep and keep[0].get("role") != "user":
            keep = keep[1:]

        # Sync self._history so the compaction is actually applied on the next turn.
        # Without this the history would be rebuilt from the full untruncated list.
        self._history = [m for m in keep if m.get("role") != "system"]

        if system_msg:
            return [system_msg] + keep
        return keep

    def _ask_plan_confirmation(self) -> bool:
        """Show an ASK dialog for plan confirmation. Returns True → proceed, False → cancel."""
        try:
            from backend.commands import registry as _reg
            result = _reg.execute("ASK", {
                "questions": [{
                    "question": "¿Proceder con este plan?",
                    "options": [
                        {"label": "Sí, proceder"},
                        {"label": "No, cancelar"},
                    ],
                    "allow_custom": False,
                }]
            })
            return "No" not in result and "cancelar" not in result.lower()
        except Exception:
            return True  # On error, proceed normally

    def _run_subagent(self, name: str, task: str) -> str:
        """Spawn a restricted sub-agent and return its final response."""
        allowed_names = self._SUBAGENT_TOOLS.get(name, set())
        all_tools = registry.to_openai_tools()
        filtered_tools = [t for t in all_tools if t["function"]["name"] in allowed_names]
        sub_prompt = self._SUBAGENT_PROMPTS.get(name, "")
        sub_channel = f"subagent_{name}"

        # Inject project path context so sub-agents use absolute paths
        if self.unity_path:
            sub_prompt = (
                f"PROJECT ROOT: {self.unity_path}\n"
                f"CRITICAL: ALL file paths in FILE_READ, FILE_WRITE, FILE_EDIT must be ABSOLUTE. "
                f"Prefix every path with the project root above. "
                f"Example: instead of 'Assets/Scripts/Foo.cs' use '{self.unity_path}/Assets/Scripts/Foo.cs'.\n\n"
                + sub_prompt
            )

        bus.emit({"type": "subagent_start", "subagent": name, "channel": sub_channel, "task": task[:200]})

        # The reasoner sub-agent uses R1 (deepseek-reasoner) for deep chain-of-thought.
        # All other sub-agents use V3 (deepseek-chat) because R1 doesn't support function calling.
        if name == "reasoner":
            sub_model = cfg.get("model_reasoning", "deepseek-reasoner")
        else:
            sub_model = cfg.get("model_default", "deepseek-chat")

        sub = UAgent(
            project_name=self.project_name,
            unity_path=self.unity_path,
            context_dir=self.context_dir,
            active_model=sub_model,
            channel=sub_channel,
            _allowed_tools=filtered_tools,
            _system_prompt_override=sub_prompt,
            _parent_stop_fn=lambda: self._stop_requested,
        )
        # Load same project context
        sub._history = []
        result = sub.run(task)

        bus.emit({"type": "subagent_done", "subagent": name, "channel": sub_channel})
        return result or "[sub-agent returned no response]"

    def _cleanup_dangling_history(self) -> None:
        """Remove incomplete assistant+tool_call groups from history.

        After an interrupt the agent may have appended an assistant message with
        tool_calls that were never (or only partially) executed.  The DeepSeek API
        rejects any conversation where a tool_calls message is not followed by a
        complete set of matching tool result messages, so we must remove the entire
        group (assistant message + any partial tool results) before the next run.
        """
        # Walk through history tracking which assistant messages have tool_calls
        # and whether every call_id in that group has a corresponding tool result.
        # We do this in one sequential pass to preserve order semantics.
        filtered: List[Dict[str, Any]] = []
        ids_to_drop: set = set()

        for msg in self._history:
            role = msg.get("role")

            if role == "assistant" and msg.get("tool_calls"):
                call_ids = {tc.get("id") for tc in msg["tool_calls"] if tc.get("id")}
                # Collect tool result IDs that immediately follow in history
                result_ids: set = set()
                idx = self._history.index(msg) + 1
                while idx < len(self._history) and self._history[idx].get("role") == "tool":
                    result_ids.add(self._history[idx].get("tool_call_id"))
                    idx += 1
                if not call_ids.issubset(result_ids):
                    # This group is incomplete — mark all its IDs for removal
                    ids_to_drop.update(call_ids)
                    continue  # Drop the assistant message

            if role == "tool" and msg.get("tool_call_id") in ids_to_drop:
                continue  # Drop orphaned / partial tool results

            filtered.append(msg)

        self._history = filtered

    def _maybe_compress_history(self) -> None:
        """Compress old history entries into a summary when history gets too long."""
        if len(self._history) <= COMPRESS_THRESHOLD:
            return

        tail = self._history[-COMPRESS_KEEP_TAIL:]
        to_summarize = self._history[:-COMPRESS_KEEP_TAIL]

        summary_input = "\n".join(
            f"[{m['role'].upper()}] {str(m.get('content', ''))[:400]}"
            for m in to_summarize
        )

        summary_messages = [
            {
                "role": "system",
                "content": (
                    "You are a context summarizer. Given the conversation history below, "
                    "produce a concise structured summary as JSON with these keys: "
                    '"files_touched" (list of file paths mentioned), '
                    '"decisions" (list of key decisions made), '
                    '"current_state" (1-2 sentences on where the project is now). '
                    "Reply ONLY with the JSON object."
                ),
            },
            {"role": "user", "content": summary_input},
        ]

        try:
            bus.emit({"type": "context_compressing", "channel": self.channel, "count": len(to_summarize)})
            summary_text, _ = models.stream_completion(
                messages=summary_messages,
                model=self.active_model,
                tools=None,
                channel=self.channel,
                message_id=self._current_message_id or "compress",
            )
            self._history = [
                {"role": "user", "content": f"[CONTEXT SUMMARY — {len(to_summarize)} messages compressed]\n{summary_text}"},
                {"role": "assistant", "content": "Understood, I have the context summary."},
            ] + tail
            bus.emit({"type": "context_compressed", "channel": self.channel, "kept": len(self._history)})
        except Exception:
            pass  # If compression fails, just continue with full history

    def _planning_step(self, user_message: str, system_prompt: str) -> None:
        """Pre-execution planning step: stream a plan_board to the main chat."""
        planning_messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    f"{user_message}\n\n"
                    "[PLANNING MODE] Before acting, produce ONLY a ```gui plan_board``` block "
                    "listing every step you will take. Do NOT call any tools. Do NOT write any code. "
                    "Just output the plan as a plan_board gui element."
                ),
            },
        ]
        try:
            models.stream_completion(
                messages=planning_messages,
                model=self.active_model,
                tools=None,
                channel="planning",
                message_id=f"plan-{self._current_message_id}",
            )
        except Exception:
            pass

        bus.emit({"type": "plan_ready", "channel": "planning"})

    def _append_session_log(self, user_message: str, response: str) -> None:
        if not self.context_dir:
            return
        log_path = self.context_dir / "SESSION_LOG.md"
        try:
            entry = (
                f"\n## {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
                f"**Tarea**: {user_message[:200]}\n"
                f"**Resumen**: {response[:300]}\n"
                f"---\n"
            )
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(entry)
        except Exception:
            pass
