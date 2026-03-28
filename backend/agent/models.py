"""
DeepSeek API clients for V3 (deepseek-chat) and R1 (deepseek-reasoner).
V3 supports full system prompts and function calling.
R1 does NOT support system prompts — context is injected into the first user message.
"""
from __future__ import annotations
import json
import sys
import time
from typing import Any, Dict, Generator, List, Optional, Tuple

import httpx

from backend import settings as cfg
from backend.events import bus

DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
MAX_RETRIES = 2
TIMEOUT_SECONDS = 120


def _get_api_key() -> str:
    key = cfg.get("deepseek_api_key", "")
    if not key:
        raise RuntimeError(
            "DeepSeek API key not configured. Set DEEPSEEK_API_KEY in .env or settings."
        )
    return key


def stream_completion(
    messages: List[Dict[str, Any]],
    model: str,
    tools: Optional[List[Dict[str, Any]]] = None,
    temperature: Optional[float] = None,
    stop_fn: Optional[Any] = None,
    channel: str = "main",
    message_id: str = "",
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Call the DeepSeek API with streaming. Returns (full_text, tool_calls).
    Emits 'message_token' events for each streamed token.
    stop_fn: optional callable() → bool; if it returns True the stream is interrupted.
    """
    api_key = _get_api_key()
    if temperature is None:
        temperature = (
            cfg.get("temperature_r1", 0.6)
            if "reasoner" in model
            else cfg.get("temperature_v3", 0.3)
        )

    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 8192,
        "stream": True,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    last_error: Optional[Exception] = None
    for attempt in range(MAX_RETRIES):
        try:
            return _do_stream(payload, headers, stop_fn=stop_fn, channel=channel, message_id=message_id)
        except (httpx.TimeoutException, httpx.ReadError) as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                time.sleep(2)
                continue
        except _ContextLengthError:
            raise
        except Exception as e:
            raise RuntimeError(f"DeepSeek API error: {e}") from e

    raise RuntimeError(f"DeepSeek API failed after {MAX_RETRIES} attempts: {last_error}")


class _ContextLengthError(Exception):
    pass


def _do_stream(
    payload: Dict[str, Any],
    headers: Dict[str, str],
    stop_fn: Optional[Any] = None,
    channel: str = "main",
    message_id: str = "",
) -> Tuple[str, List[Dict[str, Any]]]:
    content_parts: List[str] = []
    # tool_calls accumulated by index
    tool_calls_map: Dict[int, Dict[str, Any]] = {}
    thinking_parts: List[str] = []
    in_thinking = False

    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        with client.stream(
            "POST",
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            json=payload,
            headers=headers,
        ) as response:
            if response.status_code == 400:
                body = response.read().decode()
                if "context" in body.lower() or "length" in body.lower():
                    raise _ContextLengthError(body)
                raise RuntimeError(f"DeepSeek 400 error: {body}")
            if response.status_code != 200:
                body = response.read().decode()
                raise RuntimeError(f"DeepSeek {response.status_code}: {body}")

            for raw_line in response.iter_lines():
                # Check stop flag on every token — allows near-instant interruption
                if stop_fn and stop_fn():
                    break
                line = raw_line.strip()
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue

                choice = chunk.get("choices", [{}])[0]
                delta = choice.get("delta", {})

                # Token usage (present on the final chunk from DeepSeek)
                usage = chunk.get("usage")
                if usage:
                    bus.emit({
                        "type": "token_usage",
                        "channel": channel,
                        "message_id": message_id,
                        "model": payload["model"],
                        "prompt_tokens": usage.get("prompt_tokens", 0),
                        "completion_tokens": usage.get("completion_tokens", 0),
                        "total_tokens": usage.get("total_tokens", 0),
                    })

                # Reasoning content (R1 <think> block)
                reasoning = delta.get("reasoning_content") or ""
                if reasoning:
                    thinking_parts.append(reasoning)
                    bus.emit({"type": "thinking_token", "content": reasoning, "channel": channel})

                # Regular content
                text = delta.get("content") or ""
                if text:
                    content_parts.append(text)
                    sys.stdout.write(text)
                    sys.stdout.flush()
                    bus.emit({"type": "message_token", "content": text, "channel": channel})

                # Tool calls (streaming chunks) — emit command_building for live feedback
                for tc_delta in delta.get("tool_calls", []):
                    idx = tc_delta.get("index", 0)
                    if idx not in tool_calls_map:
                        tool_calls_map[idx] = {
                            "id": "",
                            "type": "function",
                            "function": {"name": "", "arguments": ""},
                        }
                    tc = tool_calls_map[idx]
                    if tc_delta.get("id"):
                        tc["id"] += tc_delta["id"]
                    fn_delta = tc_delta.get("function", {})
                    changed = False
                    if fn_delta.get("name"):
                        tc["function"]["name"] += fn_delta["name"]
                        changed = True
                    if fn_delta.get("arguments"):
                        tc["function"]["arguments"] += fn_delta["arguments"]
                        changed = True
                    if changed:
                        bus.emit({
                            "type": "command_building",
                            "channel": channel,
                            "message_id": message_id,
                            "index": idx,
                            "name": tc["function"]["name"],
                            "args_raw": tc["function"]["arguments"],
                        })

                # Check finish reason
                finish = choice.get("finish_reason")
                if finish and finish not in ("null", None):
                    pass  # continue consuming stream

    tool_calls = [tool_calls_map[i] for i in sorted(tool_calls_map)]
    full_text = "".join(content_parts)
    return full_text, tool_calls
