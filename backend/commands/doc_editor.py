"""
Document editor commands for GDD.md and TDD.md.
DOC_READ — read a document from the active project's context directory.
DOC_UPDATE — update (append or replace section) in a document.
DOC_LIST — list available documents.
"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Any, Dict, Optional

from backend.commands import ArgSchema, Command, registry
from backend.events import bus

# The active project context dir is set at runtime by the project manager
_active_context_dir: Optional[Path] = None


def set_context_dir(path: Path) -> None:
    global _active_context_dir
    _active_context_dir = path


def _get_doc_path(name: str) -> Optional[Path]:
    if _active_context_dir is None:
        return None
    name = name if name.endswith(".md") else f"{name}.md"
    return _active_context_dir / name


def _read_doc(args: Dict[str, Any]) -> str:
    name = args["document"]
    path = _get_doc_path(name)
    if path is None:
        return "[ERROR] No active project. Create or open a project first."
    if not path.exists():
        return f"Document '{name}' does not exist yet."
    return path.read_text(encoding="utf-8")


def _update_doc(args: Dict[str, Any]) -> str:
    name = args["document"]
    path = _get_doc_path(name)
    if path is None:
        return "[ERROR] No active project."

    path.parent.mkdir(parents=True, exist_ok=True)
    mode = args.get("mode", "append")  # "append", "replace_section", "overwrite"
    content = args["content"]

    if mode == "overwrite":
        path.write_text(content, encoding="utf-8")
        result = f"Overwrote {name} ({len(content)} chars)"

    elif mode == "replace_section":
        section = args.get("section", "")
        if not section:
            return "[ERROR] 'section' is required for replace_section mode."
        if path.exists():
            doc = path.read_text(encoding="utf-8")
            # Find heading and replace until next same-level heading
            level = len(re.match(r"^(#+)", section).group(1)) if re.match(r"^#+", section) else 2
            heading_pat = re.escape(section.strip())
            next_heading_pat = r"(?=\n#{1," + str(level) + r"} )"
            pattern = heading_pat + r".*?" + next_heading_pat
            if re.search(pattern, doc, re.DOTALL):
                new_doc = re.sub(pattern, content.rstrip() + "\n\n", doc, flags=re.DOTALL)
                path.write_text(new_doc, encoding="utf-8")
                result = f"Replaced section '{section}' in {name}"
            else:
                # Section not found: append it
                path.write_text(doc.rstrip() + "\n\n" + content, encoding="utf-8")
                result = f"Section not found, appended to {name}"
        else:
            path.write_text(content, encoding="utf-8")
            result = f"Created {name} with section '{section}'"

    else:  # append
        existing = path.read_text(encoding="utf-8") if path.exists() else ""
        path.write_text(existing.rstrip() + "\n\n" + content, encoding="utf-8")
        result = f"Appended to {name}"

    # Notify GUI of document update
    bus.emit({
        "type": "doc_updated",
        "document": name,
        "content": path.read_text(encoding="utf-8"),
    })
    return result


def _list_docs(args: Dict[str, Any]) -> str:
    if _active_context_dir is None:
        return "[ERROR] No active project."
    if not _active_context_dir.exists():
        return "No documents yet."
    docs = sorted(_active_context_dir.glob("*.md"))
    return "\n".join(d.name for d in docs) if docs else "No documents yet."


registry.register(Command(
    name="DOC_READ",
    description=(
        "Read a project document (GDD.md, TDD.md, GAME_CONTEXT.md, MEMORY.md). "
        "Always read before updating to understand existing content."
    ),
    args=[
        ArgSchema("document", "string", "Document name (e.g. 'GDD', 'TDD', 'GAME_CONTEXT', 'MEMORY')"),
    ],
    executor=_read_doc,
    category="docs",
))

registry.register(Command(
    name="DOC_UPDATE",
    description=(
        "Update a project document. Use mode='append' to add content, "
        "'replace_section' to replace a specific heading section, "
        "or 'overwrite' to replace the entire file."
    ),
    args=[
        ArgSchema("document", "string", "Document name (GDD, TDD, GAME_CONTEXT, MEMORY)"),
        ArgSchema("content", "string", "Markdown content to write"),
        ArgSchema("mode", "string", "Update mode: 'append', 'replace_section', or 'overwrite'", required=False, enum=["append", "replace_section", "overwrite"]),
        ArgSchema("section", "string", "Section heading to replace (only for replace_section mode)", required=False),
    ],
    executor=_update_doc,
    category="docs",
))

registry.register(Command(
    name="DOC_LIST",
    description="List all documents in the active project's context directory.",
    args=[],
    executor=_list_docs,
    category="docs",
))
