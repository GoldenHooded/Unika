"""SHELL command — execute Windows cmd.exe commands."""
from __future__ import annotations
import subprocess
from typing import Any, Dict

from backend.commands import ArgSchema, Command, registry


def _execute(args: Dict[str, Any]) -> str:
    command = args["command"]
    cwd = args.get("cwd")
    timeout = int(args.get("timeout", 30))
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=cwd,
            timeout=timeout,
        )
        output = result.stdout
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"
        if result.returncode != 0:
            output += f"\n[exit code: {result.returncode}]"
        return output.strip() or "(no output)"
    except subprocess.TimeoutExpired:
        return f"[ERROR] Command timed out after {timeout}s"
    except Exception as e:
        return f"[ERROR] {e}"


registry.register(Command(
    name="SHELL",
    description=(
        "Execute a Windows shell command (cmd.exe). Use for build scripts, Unity CLI, "
        "git operations, npm/pip installs, etc. Prefer FILE_* commands for file operations."
    ),
    args=[
        ArgSchema("command", "string", "The shell command to execute"),
        ArgSchema("cwd", "string", "Working directory for the command", required=False),
        ArgSchema("timeout", "integer", "Timeout in seconds (default: 30)", required=False),
    ],
    executor=_execute,
    category="system",
))
