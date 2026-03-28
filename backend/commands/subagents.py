"""Sub-agent delegation commands."""
from __future__ import annotations
from typing import Any, Dict
from backend.commands import ArgSchema, Command, registry

# Set by UAgent._execute_tools before dispatching; thread-local for parallel safety
import threading
_local = threading.local()

def _get_agent():
    return getattr(_local, "agent", None)

def set_current_agent(agent) -> None:
    _local.agent = agent

def _call_subagent(name: str, args: Dict[str, Any]) -> str:
    agent = _get_agent()
    if agent is None:
        return "[ERROR] No parent agent context available"
    # Each command uses a different primary arg name — accept all variants
    task = (
        args.get("task") or
        args.get("problem") or   # CALL_REASONER
        args.get("files") or     # CALL_REVIEWER
        ""
    ).strip()
    if not task:
        return "[ERROR] task/problem/files argument is required"
    return agent._run_subagent(name, task)

registry.register(Command(
    name="CALL_CODER",
    description=(
        "Delegate a C# coding task to the specialized Coder sub-agent. "
        "The Coder can read files, write/edit C# scripts, compile, and read the console. "
        "Provide the FULL detailed task description in 'task'. "
        "Use this for any C# writing or editing work."
    ),
    args=[ArgSchema("task", "string", "The full coding task description")],
    executor=lambda args: _call_subagent("coder", args),
    category="subagent",
))

registry.register(Command(
    name="CALL_PLANNER",
    description=(
        "Delegate a planning task to the Planner sub-agent. "
        "Returns a structured plan_board with steps before execution. "
        "Use this before any multi-file or architectural task."
    ),
    args=[ArgSchema("task", "string", "What to plan")],
    executor=lambda args: _call_subagent("planner", args),
    category="subagent",
))

registry.register(Command(
    name="CALL_SEARCH",
    description=(
        "Delegate a research task to the Search sub-agent. "
        "Returns a summary of findings from web search and documentation. "
        "Use this for Unity API questions, package versions, or technical research."
    ),
    args=[ArgSchema("task", "string", "What to search for")],
    executor=lambda args: _call_subagent("search", args),
    category="subagent",
))

registry.register(Command(
    name="CALL_REVIEWER",
    description=(
        "Invoke the Code Reviewer sub-agent on recently written or modified C# files. "
        "MANDATORY after every coding task: always call this after CALL_CODER finishes. "
        "The reviewer reads the files, compiles, checks the console, fixes any errors, "
        "and returns APPROVED / FIXED / FAILED with a brief explanation. "
        "Provide the list of modified files in 'files'."
    ),
    args=[ArgSchema("files", "string", "Comma-separated list of modified file paths to review")],
    executor=lambda args: _call_subagent("reviewer", args),
    category="subagent",
))

registry.register(Command(
    name="CALL_REASONER",
    description=(
        "Delegate a complex reasoning task to the Reasoner sub-agent (powered by R1). "
        "Use this when you face a difficult decision, non-obvious bug, architectural trade-off, "
        "or any problem that benefits from deep chain-of-thought analysis. "
        "The sub-agent reasons extensively and returns a definitive CONCLUSION you can act on. "
        "Provide ALL relevant context (existing code snippets, error messages, constraints) in 'problem'."
    ),
    args=[ArgSchema("problem", "string", "Full problem description with all relevant context")],
    executor=lambda args: _call_subagent("reasoner", args),
    category="subagent",
))
