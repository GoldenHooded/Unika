"""
UNITY_COMPILE — trigger script compilation inside the Unity Editor.

Primary path: sends a Compile action to UnikaBridge.cs via the WebSocket bridge.
  • Calls AssetDatabase.Refresh() + CompilationPipeline.RequestScriptCompilation()
  • Returns immediately; compilation runs in background inside Unity.

After calling UNITY_COMPILE use WAIT (3–10 s) then UNITY_READ_CONSOLE to check
for compiler errors.
"""
from __future__ import annotations
import json
from typing import Any, Dict, Optional

from backend.commands import ArgSchema, Command, registry
from backend.events import bus


# Resolved at runtime (set by unity_bridge module)
_bridge: Optional[Any] = None


def set_bridge(bridge: Any) -> None:
    global _bridge
    _bridge = bridge


def _execute(args: Dict[str, Any]) -> str:
    wait_for_result = args.get("wait", False)

    # ── Primary path: bridge is connected ────────────────────────────────────
    if _bridge is not None and _bridge.is_connected:
        try:
            result = _bridge.send_sync({"action": "Compile", "params": {}})
            if isinstance(result, dict):
                if result.get("error"):
                    return f"[Unity Error] {result['error']}"
                data = result.get("data", {})
                msg = (
                    f"✅ Compilación iniciada en Unity.\n"
                    f"Unity está recompilando scripts. "
                    f"Usa WAIT(3) y luego UNITY_READ_CONSOLE para ver el resultado."
                )
                if isinstance(data, dict) and data.get("had_errors"):
                    msg += f"\n⚠️ Había errores previos: {data.get('errors', [])}"
                return msg
        except Exception as e:
            return f"[Unity Error] No se pudo iniciar compilación: {e}"

    # ── Fallback: bridge not connected ───────────────────────────────────────
    return (
        "[Unity Disconnected] Unity no está conectado. "
        "Abre Unity Editor con el proyecto cargado para que el plugin UnikaBridge se conecte. "
        "Una vez conectado (indicador verde en la UI), vuelve a usar UNITY_COMPILE.\n\n"
        "Alternativa: guarda cualquier script modificado — Unity detecta los cambios y recompila automáticamente."
    )


registry.register(Command(
    name="UNITY_COMPILE",
    description=(
        "Trigger C# script compilation in the Unity Editor. "
        "Calls AssetDatabase.Refresh() and RequestScriptCompilation() inside Unity. "
        "Compilation runs in the background — use WAIT(5) then UNITY_READ_CONSOLE "
        "to check for compiler errors. "
        "Requires Unity to be connected (plugin installed and running)."
    ),
    args=[],
    executor=_execute,
    category="unity",
))
