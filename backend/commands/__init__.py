"""
Command registry for Unika agent tools.
Commands register themselves at import time.
"""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


@dataclass
class ArgSchema:
    name: str
    type: str  # "string", "integer", "boolean", "object", "array"
    description: str
    required: bool = True
    enum: Optional[List[str]] = None


@dataclass
class Command:
    name: str
    description: str
    args: List[ArgSchema]
    executor: Callable[[Dict[str, Any]], str]
    returns: str = "string"
    category: str = "general"


class CommandRegistry:
    def __init__(self):
        self._commands: Dict[str, Command] = {}

    def register(self, cmd: Command) -> None:
        self._commands[cmd.name] = cmd

    def get(self, name: str) -> Optional[Command]:
        return self._commands.get(name)

    def all(self) -> List[Command]:
        return list(self._commands.values())

    def execute(self, name: str, args: Dict[str, Any]) -> str:
        cmd = self.get(name)
        if cmd is None:
            return f"[ERROR] Unknown command: {name}"
        try:
            result = cmd.executor(args)
            return result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
        except Exception as e:
            return f"[ERROR] {name} failed: {e}"

    def to_openai_tools(self) -> List[Dict[str, Any]]:
        """Convert registry to OpenAI function-calling format."""
        tools = []
        for cmd in self._commands.values():
            properties: Dict[str, Any] = {}
            required: List[str] = []
            for arg in cmd.args:
                prop: Dict[str, Any] = {
                    "type": arg.type,
                    "description": arg.description,
                }
                if arg.enum:
                    prop["enum"] = arg.enum
                properties[arg.name] = prop
                if arg.required:
                    required.append(arg.name)
            tools.append({
                "type": "function",
                "function": {
                    "name": cmd.name,
                    "description": cmd.description,
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": required,
                    },
                },
            })
        return tools


# Global singleton
registry = CommandRegistry()


def _load_all_commands() -> None:
    """Import all command modules so they self-register."""
    from backend.commands import (  # noqa: F401
        files,
        shell,
        search,
        ask,
        memory,
        think,
        doc_editor,
        unity_bridge,
        unity_setup,
        wait,
        unity_compile,
        subagents,
    )


_load_all_commands()
