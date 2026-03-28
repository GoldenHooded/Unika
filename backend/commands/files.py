"""
File system commands: FILE_READ, FILE_READ_LINES, FILE_WRITE, FILE_EDIT,
FILE_EDIT_SECTION, FILE_APPEND, FILE_LIST, FILE_GREP, FILE_FIND, FILE_DELETE.
"""
from __future__ import annotations
import difflib
import os
import re
import time
from pathlib import Path
from typing import Any, Dict

from backend.commands import ArgSchema, Command, registry


def _read(args: Dict[str, Any]) -> str:
    path = Path(args["path"])
    encoding = args.get("encoding", "utf-8")
    try:
        content = path.read_text(encoding=encoding, errors="replace")
        lines = content.splitlines()
        offset = int(args.get("offset", 0))
        limit = args.get("limit")
        if offset or limit:
            lines = lines[offset: offset + int(limit) if limit else None]
            content = "\n".join(lines)
        return content
    except FileNotFoundError:
        return f"[ERROR] File not found: {path}"
    except Exception as e:
        return f"[ERROR] {e}"


def _write(args: Dict[str, Any]) -> str:
    path = Path(args["path"])
    content = args["content"]
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            return f"Written {len(content)} chars to {path}"
        except (OSError, PermissionError) as e:
            last_err = e
            if attempt < 2:
                time.sleep(1)
    return f"[ERROR] {last_err}"


def _append(args: Dict[str, Any]) -> str:
    path = Path(args["path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(args["content"])
    return f"Appended to {path}"


def _edit(args: Dict[str, Any]) -> str:
    """Replace old_string with new_string in a file, returning a unified diff."""
    path = Path(args["path"])
    if not path.exists():
        return f"[ERROR] File not found: {path}"
    content = path.read_text(encoding="utf-8")
    old = args["old_string"]
    new = args["new_string"]
    replace_all = bool(args.get("replace_all", False))
    if old not in content:
        return f"[ERROR] old_string not found in {path}"
    if replace_all:
        new_content = content.replace(old, new)
    else:
        new_content = content.replace(old, new, 1)

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            path.write_text(new_content, encoding="utf-8")
            break
        except (OSError, PermissionError) as e:
            last_err = e
            if attempt < 2:
                time.sleep(1)
    else:
        return f"[ERROR] {last_err}"

    # Return a compact unified diff so the model and review panel can show what changed
    diff_lines = list(difflib.unified_diff(
        content.splitlines(keepends=True),
        new_content.splitlines(keepends=True),
        fromfile=f"a/{path.name}",
        tofile=f"b/{path.name}",
        n=2,
    ))
    if len(diff_lines) > 80:
        diff_lines = diff_lines[:80]
        diff_lines.append("... (diff truncated)\n")
    if diff_lines:
        return "OK\n```diff\n" + "".join(diff_lines) + "```"
    return f"OK (no effective change) in {path.name}"


# Folders that are never useful to expand — shown as collapsed summaries
_IGNORED_DIRS = {
    "library", "temp", "obj", "logs", ".git", ".vs", ".idea",
    "node_modules", "__pycache__", ".gradle", "build", "builds",
}

# Extensions grouped for compact summary lines
_EXT_GROUP: Dict[str, str] = {
    ".cs": "scripts", ".js": "scripts", ".ts": "scripts", ".py": "scripts",
    ".png": "textures", ".jpg": "textures", ".jpeg": "textures",
    ".tga": "textures", ".psd": "textures", ".exr": "textures",
    ".wav": "audio", ".mp3": "audio", ".ogg": "audio", ".aiff": "audio",
    ".fbx": "models", ".obj": "models", ".blend": "models", ".dae": "models",
    ".mat": "materials", ".shader": "shaders", ".hlsl": "shaders",
    ".prefab": "prefabs", ".unity": "scenes", ".asset": "assets",
    ".anim": "animations", ".controller": "animations", ".overrideController": "animations",
    ".ttf": "fonts", ".otf": "fonts",
    ".json": "data", ".xml": "data", ".csv": "data", ".yaml": "data", ".yml": "data",
    ".dll": "dlls", ".so": "dlls", ".dylib": "dlls",
    ".pdf": "docs", ".md": "docs", ".txt": "docs",
}

# Max files shown individually per directory before switching to summary
_MAX_FILES_PER_DIR = 50
# Max total output lines before truncating
_MAX_TOTAL_LINES = 120


def _summarise_files(files: list[Path]) -> str:
    """Return a compact one-line summary for a list of files."""
    counts: Dict[str, int] = {}
    for f in files:
        group = _EXT_GROUP.get(f.suffix.lower(), f.suffix.lower() or "misc")
        counts[group] = counts.get(group, 0) + 1
    parts = [f"{v} {k}" for k, v in sorted(counts.items(), key=lambda x: -x[1])]
    return f"[{len(files)} files: {', '.join(parts)}]"


def _list_dir(args: Dict[str, Any]) -> str:
    path = Path(args["path"])
    if not path.exists():
        return f"[ERROR] Path not found: {path}"
    recursive = bool(args.get("recursive", False))
    pattern = args.get("pattern", "*")
    max_files = int(args.get("max_files", _MAX_FILES_PER_DIR))
    try:
        lines: list[str] = []

        if not recursive:
            # Non-recursive: simple flat listing with per-dir summaries
            items = sorted(path.glob(pattern))
            files_here: list[Path] = []
            dirs_here: list[Path] = []
            for item in items:
                (dirs_here if item.is_dir() else files_here).append(item)

            for d in dirs_here:
                name_lower = d.name.lower()
                if name_lower in _IGNORED_DIRS:
                    # Count children without listing them
                    try:
                        child_count = sum(1 for _ in d.iterdir())
                        lines.append(f"📁 {d.name}/  [{child_count} items, not expanded]")
                    except Exception:
                        lines.append(f"📁 {d.name}/  [not expanded]")
                else:
                    lines.append(f"📁 {d.name}/")

            if len(files_here) <= max_files:
                for f in files_here:
                    lines.append(f"📄 {f.name}")
            else:
                lines.append(f"📄 {_summarise_files(files_here)}  (use max_files={len(files_here)} to see all)")

        else:
            # Recursive: walk directory tree, collapsing ignored dirs and large dirs
            def _walk(cur: Path, indent: int) -> None:
                if len(lines) >= _MAX_TOTAL_LINES:
                    return
                name_lower = cur.name.lower()
                prefix = "  " * indent
                rel = cur.relative_to(path)

                if name_lower in _IGNORED_DIRS:
                    try:
                        child_count = sum(1 for _ in cur.iterdir())
                        lines.append(f"{prefix}📁 {rel}/  [{child_count} items, not expanded]")
                    except Exception:
                        lines.append(f"{prefix}📁 {rel}/  [not expanded]")
                    return

                if indent > 0:
                    lines.append(f"{prefix}📁 {rel}/")

                try:
                    children = sorted(cur.iterdir())
                except PermissionError:
                    lines.append(f"{prefix}  [permission denied]")
                    return

                sub_dirs = [c for c in children if c.is_dir()]
                sub_files = [c for c in children if c.is_file()]

                # Filter files by pattern
                if pattern != "*":
                    import fnmatch
                    sub_files = [f for f in sub_files if fnmatch.fnmatch(f.name, pattern)]

                for d in sub_dirs:
                    if len(lines) >= _MAX_TOTAL_LINES:
                        lines.append(f"{prefix}  ... (truncated)")
                        return
                    _walk(d, indent + 1)

                if sub_files:
                    file_prefix = "  " * (indent + 1)
                    if len(sub_files) <= max_files:
                        for f in sub_files:
                            if len(lines) >= _MAX_TOTAL_LINES:
                                lines.append(f"{file_prefix}... (truncated)")
                                return
                            lines.append(f"{file_prefix}📄 {f.name}")
                    else:
                        lines.append(f"{file_prefix}📄 {_summarise_files(sub_files)}  (use max_files={len(sub_files)} to see all)")

            _walk(path, 0)

            if len(lines) >= _MAX_TOTAL_LINES:
                lines.append(f"... (output capped at {_MAX_TOTAL_LINES} lines)")

        return "\n".join(lines) if lines else "(empty)"
    except Exception as e:
        return f"[ERROR] {e}"


def _grep(args: Dict[str, Any]) -> str:
    path = Path(args["path"])
    pattern = args["pattern"]
    file_glob = args.get("glob", "**/*")
    case_insensitive = bool(args.get("case_insensitive", False))
    context_lines = int(args.get("context", 2))
    flags = re.IGNORECASE if case_insensitive else 0
    results = []
    try:
        files = list(path.rglob(file_glob)) if path.is_dir() else [path]
        for f in files:
            if not f.is_file():
                continue
            try:
                lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
            except Exception:
                continue
            for i, line in enumerate(lines):
                if re.search(pattern, line, flags):
                    start = max(0, i - context_lines)
                    end = min(len(lines), i + context_lines + 1)
                    snippet = "\n".join(
                        f"  {'>' if j == i else ' '} {j+1}: {lines[j]}"
                        for j in range(start, end)
                    )
                    results.append(f"{f}:\n{snippet}")
            if len(results) > 50:
                results.append("... (truncated at 50 matches)")
                break
    except Exception as e:
        return f"[ERROR] {e}"
    return "\n\n".join(results) if results else "No matches found."


def _find(args: Dict[str, Any]) -> str:
    path = Path(args["path"])
    pattern = args["pattern"]
    try:
        items = sorted(path.rglob(pattern))
        return "\n".join(str(i) for i in items) if items else "No files found."
    except Exception as e:
        return f"[ERROR] {e}"


def _read_lines(args: Dict[str, Any]) -> str:
    """Read a file and prefix every line with its 1-based line number."""
    path = Path(args["path"])
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except FileNotFoundError:
        return f"[ERROR] File not found: {path}"
    except Exception as e:
        return f"[ERROR] {e}"

    from_line = int(args.get("from_line", 1))
    to_line   = int(args.get("to_line",   len(lines)))
    from_line = max(1, from_line)
    to_line   = min(len(lines), to_line)

    if from_line > len(lines):
        return f"[ERROR] from_line {from_line} exceeds file length ({len(lines)} lines)"

    width = len(str(to_line))
    result = "\n".join(
        f"{str(i + 1).rjust(width)} │ {lines[i]}"
        for i in range(from_line - 1, to_line)
    )
    total = to_line - from_line + 1
    header = f"[{path.name}  lines {from_line}–{to_line} of {len(lines)}]\n"
    return header + result


def _edit_section(args: Dict[str, Any]) -> str:
    """Replace a range of lines with new_content.

    Range can be specified as:
      • from_line / to_line  — explicit 1-based line numbers (inclusive).
      • match / to_match     — replace from the first line containing `match`
                               to the first line (at or after) containing `to_match`.
      • match only           — replace only the single line containing `match`.
    """
    path = Path(args["path"])
    if not path.exists():
        return f"[ERROR] File not found: {path}"

    new_content: str = args.get("new_content", "")
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    # Normalize: ensure each line ends with \n
    def _nl(l: str) -> str:
        return l if l.endswith("\n") else l + "\n"
    lines = [_nl(l) for l in lines]

    total = len(lines)

    # ── Resolve start / end indices (0-based, inclusive) ─────────────────────
    if "from_line" in args:
        start = int(args["from_line"]) - 1
        end   = int(args.get("to_line", args["from_line"])) - 1
    elif "match" in args:
        needle = args["match"]
        start = next(
            (i for i, l in enumerate(lines) if needle in l),
            None,
        )
        if start is None:
            return f"[ERROR] match string not found: {needle!r}"
        if "to_match" in args:
            end_needle = args["to_match"]
            end = next(
                (i for i, l in enumerate(lines) if i >= start and end_needle in l),
                None,
            )
            if end is None:
                return f"[ERROR] to_match string not found after line {start+1}: {end_needle!r}"
        else:
            end = start
    else:
        return "[ERROR] Provide from_line or match to identify the section."

    # Clamp
    start = max(0, min(start, total - 1))
    end   = max(start, min(end, total - 1))

    # Build replacement lines
    replacement = (new_content + "\n") if new_content and not new_content.endswith("\n") else new_content
    replacement_lines = replacement.splitlines(keepends=True) if replacement else []

    new_lines = lines[:start] + replacement_lines + lines[end + 1:]
    new_text  = "".join(new_lines)
    path.write_text(new_text, encoding="utf-8")

    _record_change({
        "op":    "FILE_EDIT_SECTION",
        "path":  str(path),
        "start": start + 1,
        "end":   end + 1,
        "new":   new_content[:500],
    })
    replaced = end - start + 1
    added    = len(replacement_lines)
    return (
        f"Replaced lines {start+1}–{end+1} ({replaced} line{'s' if replaced!=1 else ''}) "
        f"with {added} line{'s' if added!=1 else ''} in {path.name}"
    )


def _delete(args: Dict[str, Any]) -> str:
    path = Path(args["path"])
    if not path.exists():
        return f"[ERROR] Not found: {path}"
    if path.is_dir():
        import shutil
        shutil.rmtree(path)
        return f"Deleted directory: {path}"
    path.unlink()
    return f"Deleted file: {path}"


registry.register(Command(
    name="FILE_READ",
    description="Read the contents of a file. Always use this before editing a file.",
    args=[
        ArgSchema("path", "string", "Absolute path to the file"),
        ArgSchema("offset", "integer", "Line offset to start reading from (0-based)", required=False),
        ArgSchema("limit", "integer", "Max number of lines to read", required=False),
    ],
    executor=_read,
    category="files",
))

registry.register(Command(
    name="FILE_WRITE",
    description="Write content to a file, creating it (and parent directories) if needed. Overwrites existing content.",
    args=[
        ArgSchema("path", "string", "Absolute path to the file"),
        ArgSchema("content", "string", "Full content to write"),
    ],
    executor=_write,
    category="files",
))

registry.register(Command(
    name="FILE_APPEND",
    description="Append content to the end of a file.",
    args=[
        ArgSchema("path", "string", "Absolute path to the file"),
        ArgSchema("content", "string", "Content to append"),
    ],
    executor=_append,
    category="files",
))

registry.register(Command(
    name="FILE_EDIT",
    description="Replace an exact string in a file with new content. Read the file first to get the exact string.",
    args=[
        ArgSchema("path", "string", "Absolute path to the file"),
        ArgSchema("old_string", "string", "Exact string to find and replace"),
        ArgSchema("new_string", "string", "Replacement string"),
        ArgSchema("replace_all", "boolean", "Replace all occurrences (default: false, replaces only first)", required=False),
    ],
    executor=_edit,
    category="files",
))

registry.register(Command(
    name="FILE_LIST",
    description="List files and directories in a path. Large dirs and Unity internals (Library, Temp…) are auto-collapsed. When the output shows a summary line with '(use max_files=N to see all)', re-call with that max_files value to expand.",
    args=[
        ArgSchema("path", "string", "Directory path to list"),
        ArgSchema("recursive", "boolean", "List recursively (default: false)", required=False),
        ArgSchema("pattern", "string", "Glob pattern filter (default: *)", required=False),
        ArgSchema("max_files", "integer", "Max individual files shown per directory before summarising (default: 50). Increase to see all files in large dirs.", required=False),
    ],
    executor=_list_dir,
    category="files",
))

registry.register(Command(
    name="FILE_GREP",
    description="Search for a regex pattern in files. Returns matching lines with context.",
    args=[
        ArgSchema("path", "string", "Directory or file path to search in"),
        ArgSchema("pattern", "string", "Regex pattern to search for"),
        ArgSchema("glob", "string", "Glob pattern to filter files (default: **/*)", required=False),
        ArgSchema("case_insensitive", "boolean", "Case-insensitive search (default: false)", required=False),
        ArgSchema("context", "integer", "Lines of context around each match (default: 2)", required=False),
    ],
    executor=_grep,
    category="files",
))

registry.register(Command(
    name="FILE_FIND",
    description="Find files by name pattern using glob.",
    args=[
        ArgSchema("path", "string", "Root directory to search from"),
        ArgSchema("pattern", "string", "Glob pattern (e.g. *.cs, Player*.prefab)"),
    ],
    executor=_find,
    category="files",
))

registry.register(Command(
    name="FILE_READ_LINES",
    description=(
        "Read a file and show each line with its 1-based line number. "
        "Use this instead of FILE_READ when you need to reference specific lines "
        "for editing with FILE_EDIT_SECTION."
    ),
    args=[
        ArgSchema("path", "string", "Absolute path to the file"),
        ArgSchema("from_line", "integer", "First line to show (1-based, default: 1)", required=False),
        ArgSchema("to_line",   "integer", "Last line to show (1-based, default: end of file)", required=False),
    ],
    executor=_read_lines,
    category="files",
))

registry.register(Command(
    name="FILE_EDIT_SECTION",
    description=(
        "Replace a contiguous block of lines in a file with new content. "
        "Identify the range either by explicit line numbers (from_line/to_line) "
        "or by anchor strings (match / to_match). "
        "Use FILE_READ_LINES first to confirm exact line numbers or anchor text. "
        "Safer than FILE_WRITE for partial edits; preserves the rest of the file."
    ),
    args=[
        ArgSchema("path",        "string",  "Absolute path to the file"),
        ArgSchema("new_content", "string",  "Replacement text (empty string to delete the section)"),
        ArgSchema("from_line",   "integer", "First line of the range to replace (1-based)", required=False),
        ArgSchema("to_line",     "integer", "Last line of the range to replace (1-based, inclusive; defaults to from_line)", required=False),
        ArgSchema("match",       "string",  "Replace the first line that contains this substring (alternative to from_line)", required=False),
        ArgSchema("to_match",    "string",  "Extend the range to the first line containing this substring (requires match)", required=False),
    ],
    executor=_edit_section,
    category="files",
))

registry.register(Command(
    name="FILE_DELETE",
    description="Delete a file or directory. Use with caution.",
    args=[
        ArgSchema("path", "string", "Absolute path to delete"),
    ],
    executor=_delete,
    category="files",
))
