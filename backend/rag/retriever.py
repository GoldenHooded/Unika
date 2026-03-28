"""
RAG retriever — query relevant code context for a given prompt.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional

from backend.rag import embeddings, store

_active_project_id: Optional[str] = None


def set_active_project(project_id: str) -> None:
    global _active_project_id
    _active_project_id = project_id


def retrieve(
    query: str,
    top_k: int = 5,
    project_id: Optional[str] = None,
    min_score: float = 0.3,
) -> List[Dict[str, Any]]:
    """Return top-k most relevant code chunks for the given query."""
    pid = project_id or _active_project_id
    if not pid:
        return []

    if store.count(pid) == 0:
        return []

    try:
        query_vec = embeddings.embed(query)
        results = store.query(pid, query_vec, top_k=top_k)
        return [r for r in results if r.get("score", 0) >= min_score]
    except Exception:
        return []
