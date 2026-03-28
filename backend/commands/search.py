"""SEARCH command — internet search via Tavily API."""
from __future__ import annotations
from typing import Any, Dict

from backend import settings as cfg
from backend.commands import ArgSchema, Command, registry


def _execute(args: Dict[str, Any]) -> str:
    query = args["query"]
    max_results = int(args.get("max_results", 5))
    search_depth = args.get("search_depth", "basic")

    api_key = cfg.get("tavily_api_key", "")
    if not api_key:
        return "[ERROR] Tavily API key not configured. Set TAVILY_API_KEY in .env"

    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
        response = client.search(
            query=query,
            max_results=max_results,
            search_depth=search_depth,
            include_answer=True,
        )
    except Exception as e:
        return f"[ERROR] Search failed: {e}"

    lines = []
    if response.get("answer"):
        lines.append(f"**Respuesta directa**: {response['answer']}\n")

    for i, result in enumerate(response.get("results", []), 1):
        title = result.get("title", "Sin título")
        url = result.get("url", "")
        content = result.get("content", "")[:500]
        lines.append(f"[{i}] {title}\n    URL: {url}\n    {content}")

    return "\n\n".join(lines) if lines else "No results found."


registry.register(Command(
    name="SEARCH",
    description=(
        "Search the internet using Tavily. Use for Unity documentation, API references, "
        "package versions, bug fixes, or any information you need from the web."
    ),
    args=[
        ArgSchema("query", "string", "Search query"),
        ArgSchema("max_results", "integer", "Number of results to return (default: 5)", required=False),
        ArgSchema("search_depth", "string", "Search depth: 'basic' (fast) or 'advanced' (deep)", required=False, enum=["basic", "advanced"]),
    ],
    executor=_execute,
    category="web",
))
