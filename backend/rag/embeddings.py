"""
Embedding model using sentence-transformers (local, no API cost).
Model: all-MiniLM-L6-v2 (general) or microsoft/codebert-base for code-heavy use.
"""
from __future__ import annotations
from typing import List, Optional

_model = None
_MODEL_NAME = "all-MiniLM-L6-v2"


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def embed(text: str) -> List[float]:
    """Embed a single text string."""
    model = _get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


def embed_batch(texts: List[str]) -> List[List[float]]:
    """Embed a batch of texts."""
    model = _get_model()
    vecs = model.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
    return [v.tolist() for v in vecs]
