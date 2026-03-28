"""
ChromaDB vector store wrapper for RAG.
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend import settings as cfg

_client = None
_collection = None
_COLLECTION_NAME = "unika_rag"


def _get_client():
    global _client
    if _client is None:
        import chromadb
        persist_dir = str(cfg.DATA_DIR / "rag_index")
        _client = chromadb.PersistentClient(path=persist_dir)
    return _client


def get_collection(project_id: str = "default"):
    """Get or create a ChromaDB collection for the given project."""
    import chromadb
    client = _get_client()
    collection_name = f"unika_{project_id}"[:63]  # ChromaDB max name length
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


def upsert(
    project_id: str,
    doc_id: str,
    content: str,
    embedding: List[float],
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    col = get_collection(project_id)
    col.upsert(
        ids=[doc_id],
        documents=[content],
        embeddings=[embedding],
        metadatas=[metadata or {}],
    )


def query(
    project_id: str,
    query_embedding: List[float],
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    col = get_collection(project_id)
    try:
        results = col.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, col.count()),
            include=["documents", "metadatas", "distances"],
        )
    except Exception:
        return []

    output = []
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    for doc, meta, dist in zip(docs, metas, distances):
        output.append({
            "content": doc,
            "file": meta.get("file", ""),
            "start_line": meta.get("start_line", 0),
            "score": 1 - dist,  # cosine similarity
            **meta,
        })
    return output


def delete_file(project_id: str, file_path: str) -> None:
    """Remove all chunks from a specific file."""
    col = get_collection(project_id)
    try:
        col.delete(where={"file": file_path})
    except Exception:
        pass


def count(project_id: str) -> int:
    try:
        return get_collection(project_id).count()
    except Exception:
        return 0
