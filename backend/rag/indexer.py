"""
File indexer + file-system watcher.
Indexes Unity project files (.cs, .shader, .hlsl, .md, .unity) into ChromaDB.
Uses watchdog for instant change detection when available; falls back to polling (2 s).
"""
from __future__ import annotations
import hashlib
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional, Set

from backend.rag import embeddings, store
from backend.events import bus

# Try to import watchdog for instant file-change detection
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler as _FSHandler
    _HAS_WATCHDOG = True
except ImportError:
    _HAS_WATCHDOG = False

# File extensions to index
INDEXED_EXTENSIONS = {".cs", ".shader", ".hlsl", ".glsl", ".cginc", ".md", ".txt"}
CHUNK_SIZE = 512   # tokens approx (chars / 4)
CHUNK_OVERLAP = 64

_watchers: Dict[str, "ProjectWatcher"] = {}  # project_id → watcher


def start_watching(project_id: str, project_path: str) -> None:
    """Start indexing and watching a Unity project directory."""
    if project_id in _watchers:
        _watchers[project_id].stop()
    watcher = ProjectWatcher(project_id, Path(project_path))
    _watchers[project_id] = watcher
    watcher.start()


def stop_watching(project_id: str) -> None:
    if project_id in _watchers:
        _watchers[project_id].stop()
        del _watchers[project_id]


def index_file(project_id: str, file_path: Path) -> int:
    """Index a single file. Returns number of chunks indexed."""
    try:
        text = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return 0

    chunks = _chunk_text(text, file_path.suffix)
    if not chunks:
        return 0

    # Delete existing chunks for this file
    store.delete_file(project_id, str(file_path))

    # Embed and upsert all chunks
    texts = [c["content"] for c in chunks]
    try:
        vecs = embeddings.embed_batch(texts)
    except Exception:
        return 0

    for i, (chunk, vec) in enumerate(zip(chunks, vecs)):
        doc_id = _chunk_id(str(file_path), i)
        store.upsert(
            project_id=project_id,
            doc_id=doc_id,
            content=chunk["content"],
            embedding=vec,
            metadata={
                "file": str(file_path),
                "start_line": chunk["start_line"],
                "end_line": chunk["end_line"],
                "extension": file_path.suffix,
            },
        )
    return len(chunks)


def _chunk_text(text: str, extension: str) -> List[Dict]:
    """Split text into overlapping chunks."""
    # For C# files: try to chunk by class/method boundaries
    lines = text.splitlines()
    chunks = []
    chunk_chars = CHUNK_SIZE * 4  # approx chars per chunk
    overlap_chars = CHUNK_OVERLAP * 4

    start = 0
    while start < len(lines):
        end = start
        char_count = 0
        while end < len(lines) and char_count < chunk_chars:
            char_count += len(lines[end]) + 1
            end += 1

        chunk_text = "\n".join(lines[start:end])
        if chunk_text.strip():
            chunks.append({
                "content": chunk_text,
                "start_line": start + 1,
                "end_line": end,
            })

        if end >= len(lines):
            break

        # Overlap: step back by overlap_chars worth of lines
        overlap_lines = 0
        overlap_count = 0
        for i in range(end - 1, start, -1):
            overlap_count += len(lines[i]) + 1
            overlap_lines += 1
            if overlap_count >= overlap_chars:
                break
        start = max(start + 1, end - overlap_lines)

    return chunks


def _chunk_id(file_path: str, chunk_index: int) -> str:
    h = hashlib.md5(file_path.encode()).hexdigest()[:8]
    return f"{h}_{chunk_index}"


class ProjectWatcher:
    def __init__(self, project_id: str, project_path: Path):
        self.project_id = project_id
        self.project_path = project_path
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._file_mtimes: Dict[str, float] = {}

    def start(self) -> None:
        self._running = True
        # Initial full index in background
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False

    def _on_file_changed(self, path: Path) -> None:
        """Handle a single file change (called from watchdog handler or polling loop)."""
        if path.suffix not in INDEXED_EXTENSIONS:
            return
        if "Library" in path.parts or "Temp" in path.parts:
            return
        try:
            count = index_file(self.project_id, path)
            if count > 0:
                self._file_mtimes[str(path)] = path.stat().st_mtime
                bus.emit({"type": "rag_file_updated", "file": str(path)})
        except Exception:
            pass

    def _run(self) -> None:
        # Full initial index
        self._full_index()
        bus.emit({"type": "rag_indexed", "project_id": self.project_id, "count": store.count(self.project_id)})

        if _HAS_WATCHDOG:
            self._run_watchdog()
        else:
            self._run_polling()

    def _run_watchdog(self) -> None:
        """Use watchdog for near-instant file change detection."""
        watcher_self = self  # capture for inner class

        class _Handler(_FSHandler):
            def on_modified(self, event):
                if not event.is_directory:
                    watcher_self._on_file_changed(Path(event.src_path))

            def on_created(self, event):
                if not event.is_directory:
                    watcher_self._on_file_changed(Path(event.src_path))

        observer = Observer()
        observer.schedule(_Handler(), str(self.project_path), recursive=True)
        observer.start()
        try:
            while self._running:
                time.sleep(1)
        finally:
            observer.stop()
            observer.join()

    def _run_polling(self) -> None:
        """Fallback: poll every 2 seconds for file changes."""
        while self._running:
            self._check_changes()
            time.sleep(2)

    def _full_index(self) -> None:
        files = [
            f for f in self.project_path.rglob("*")
            if f.is_file() and f.suffix in INDEXED_EXTENSIONS
            and "Library" not in f.parts
            and "Temp" not in f.parts
        ]
        for f in files:
            self._file_mtimes[str(f)] = f.stat().st_mtime
            index_file(self.project_id, f)

    def _check_changes(self) -> None:
        for f in self.project_path.rglob("*"):
            if not f.is_file() or f.suffix not in INDEXED_EXTENSIONS:
                continue
            if "Library" in f.parts or "Temp" in f.parts:
                continue
            try:
                mtime = f.stat().st_mtime
            except OSError:
                continue
            key = str(f)
            if self._file_mtimes.get(key) != mtime:
                self._on_file_changed(f)
