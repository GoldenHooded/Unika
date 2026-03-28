"""
Unity Bridge commands — communicate with the Unity Editor via WebSocket.
All commands send JSON requests to the UnikaBridge C# plugin running in Unity.
"""
from __future__ import annotations
import json
from typing import Any, Dict, Optional

from backend.commands import ArgSchema, Command, registry
from backend.events import bus

# The bridge client is set at runtime by unity/bridge.py
_bridge: Optional[Any] = None

# Module-level cache — key: scene_filter string (empty string = all scenes)
_hierarchy_cache: dict[str, str] = {}


def set_bridge(bridge: Any) -> None:
    global _bridge
    _bridge = bridge


def _send(action: str, params: Dict[str, Any]) -> str:
    if _bridge is None or not _bridge.is_connected:
        return (
            "[Unity Disconnected] Connect Unity first with UNITY_SETUP, "
            "or use FILE_* commands to edit scripts directly."
        )
    try:
        result = _bridge.send_sync({"action": action, "params": params})
        if isinstance(result, dict):
            if result.get("error"):
                return f"[Unity Error] {result['error']}"
            return json.dumps(result.get("data", result), ensure_ascii=False, indent=2)
        return str(result)
    except Exception as e:
        return f"[Unity Error] {e}"


# --- Hierarchy & Objects ---
def _get_hierarchy(args: Dict[str, Any]) -> str:
    key = args.get("scene", "")
    if key in _hierarchy_cache:
        return _hierarchy_cache[key] + "\n[cached]"
    result = _send("GetHierarchy", {"scene": key})
    if not result.startswith("[Unity") and not result.startswith("[ERROR"):
        _hierarchy_cache[key] = result
    return result

def _get_object(args: Dict[str, Any]) -> str:
    return _send("GetObject", {"name": args["name"], "full_path": args.get("full_path", "")})

def _create_object(args: Dict[str, Any]) -> str:
    return _send("CreateObject", {
        "name": args["name"],
        "type": args.get("type", "Empty"),
        "parent": args.get("parent", ""),
        "position": args.get("position", {"x": 0, "y": 0, "z": 0}),
    })

def _delete_object(args: Dict[str, Any]) -> str:
    return _send("DeleteObject", {"name": args["name"]})

def _set_property(args: Dict[str, Any]) -> str:
    return _send("SetProperty", {
        "object": args["object"],
        "component": args["component"],
        "property": args["property"],
        "value": args["value"],
    })

def _add_component(args: Dict[str, Any]) -> str:
    return _send("AddComponent", {"object": args["object"], "component": args["component"]})

def _remove_component(args: Dict[str, Any]) -> str:
    return _send("RemoveComponent", {"object": args["object"], "component": args["component"]})

# --- Assets ---
def _get_assets(args: Dict[str, Any]) -> str:
    return _send("GetAssets", {
        "path": args.get("path", "Assets"),
        "type": args.get("type", ""),
        "recursive": args.get("recursive", True),
    })

def _create_script(args: Dict[str, Any]) -> str:
    return _send("CreateScript", {
        "path": args["path"],
        "template": args.get("template", "MonoBehaviour"),
        "class_name": args.get("class_name", ""),
    })

# --- Console ---
def _read_console(args: Dict[str, Any]) -> str:
    return _send("ReadConsole", {"count": args.get("count", 20), "filter": args.get("filter", "all")})

def _clear_console(args: Dict[str, Any]) -> str:
    return _send("ClearConsole", {})

# --- Scenes ---
def _switch_scene(args: Dict[str, Any]) -> str:
    _hierarchy_cache.clear()
    result = _send("SwitchScene", {"name": args["name"]})
    _hierarchy_cache.clear()
    return result

def _get_scenes(args: Dict[str, Any]) -> str:
    return _send("GetScenes", {})

# --- Editor Control ---
def _execute_menu(args: Dict[str, Any]) -> str:
    return _send("ExecuteMenu", {"path": args["path"]})

def _play(args: Dict[str, Any]) -> str:
    return _send("SetPlayMode", {"mode": "play"})

def _pause(args: Dict[str, Any]) -> str:
    return _send("SetPlayMode", {"mode": "pause"})

def _stop(args: Dict[str, Any]) -> str:
    return _send("SetPlayMode", {"mode": "stop"})

def _refresh_assets(args: Dict[str, Any]) -> str:
    return _send("RefreshAssets", {})


# --- Register all commands ---
_COMMANDS = [
    Command("UNITY_GET_HIERARCHY", "Get the scene hierarchy as a JSON tree. Shows all GameObjects and their parent/child relationships.", [ArgSchema("scene", "string", "Scene name (empty for current scene)", required=False)], _get_hierarchy, category="unity"),
    Command("UNITY_GET_OBJECT", "Get detailed info about a GameObject: components, properties, transform.", [ArgSchema("name", "string", "GameObject name or path"), ArgSchema("full_path", "string", "Full hierarchy path (e.g. 'Player/Weapon/Blade')", required=False)], _get_object, category="unity"),
    Command("UNITY_CREATE_OBJECT", "Create a new GameObject in the current scene.", [ArgSchema("name", "string", "Name for the new GameObject"), ArgSchema("type", "string", "Type: 'Empty', 'Cube', 'Sphere', 'Capsule', 'Plane', 'Camera', 'Light', 'Canvas'", required=False, enum=["Empty", "Cube", "Sphere", "Capsule", "Plane", "Camera", "Light", "Canvas", "AudioSource"]), ArgSchema("parent", "string", "Parent GameObject name (empty for root)", required=False), ArgSchema("position", "object", "Position {x, y, z} (default: origin)", required=False)], _create_object, category="unity"),
    Command("UNITY_DELETE_OBJECT", "Delete a GameObject from the current scene.", [ArgSchema("name", "string", "GameObject name")], _delete_object, category="unity"),
    Command("UNITY_SET_PROPERTY", "Set a component property on a GameObject.", [ArgSchema("object", "string", "GameObject name"), ArgSchema("component", "string", "Component type name (e.g. 'Transform', 'Rigidbody', 'MeshRenderer')"), ArgSchema("property", "string", "Property name (e.g. 'position', 'mass', 'material')"), ArgSchema("value", "string", "Value to set (JSON-serializable)")], _set_property, category="unity"),
    Command("UNITY_ADD_COMPONENT", "Add a component to a GameObject.", [ArgSchema("object", "string", "GameObject name"), ArgSchema("component", "string", "Component type name")], _add_component, category="unity"),
    Command("UNITY_REMOVE_COMPONENT", "Remove a component from a GameObject.", [ArgSchema("object", "string", "GameObject name"), ArgSchema("component", "string", "Component type name")], _remove_component, category="unity"),
    Command("UNITY_GET_ASSETS", "List assets in the Unity project. Filter by path or type.", [ArgSchema("path", "string", "Assets subfolder (default: Assets)", required=False), ArgSchema("type", "string", "Filter by type: 'cs', 'prefab', 'material', 'texture', 'scene', 'audio'", required=False), ArgSchema("recursive", "boolean", "List recursively (default: true)", required=False)], _get_assets, category="unity"),
    Command("UNITY_CREATE_SCRIPT", "Create a new C# script in the Unity project.", [ArgSchema("path", "string", "Asset path (e.g. Assets/_Game/Scripts/Player/PlayerController.cs)"), ArgSchema("template", "string", "Template: 'MonoBehaviour', 'ScriptableObject', 'Editor', 'StateMachineBehaviour', 'Empty'", required=False, enum=["MonoBehaviour", "ScriptableObject", "Editor", "StateMachineBehaviour", "Empty"]), ArgSchema("class_name", "string", "Class name (inferred from filename if empty)", required=False)], _create_script, category="unity"),
    Command("UNITY_READ_CONSOLE", "Read recent Unity console logs.", [ArgSchema("count", "integer", "Number of log entries (default: 20)", required=False), ArgSchema("filter", "string", "Filter by type: 'all', 'error', 'warning', 'log'", required=False, enum=["all", "error", "warning", "log"])], _read_console, category="unity"),
    Command("UNITY_CLEAR_CONSOLE", "Clear the Unity console.", [], _clear_console, category="unity"),
    Command("UNITY_SWITCH_SCENE", "Open a scene in the Unity Editor.", [ArgSchema("name", "string", "Scene name or asset path")], _switch_scene, category="unity"),
    Command("UNITY_GET_SCENES", "List all scenes in the Unity project (from Build Settings and Assets).", [], _get_scenes, category="unity"),
    Command("UNITY_EXECUTE_MENU", "Execute any Unity Editor menu item by path.", [ArgSchema("path", "string", "Menu path (e.g. 'File/Save', 'Assets/Refresh', 'GameObject/Create Empty')")], _execute_menu, category="unity"),
    Command("UNITY_PLAY", "Enter Play mode in the Unity Editor.", [], _play, category="unity"),
    Command("UNITY_PAUSE", "Pause the Unity Editor Play mode.", [], _pause, category="unity"),
    Command("UNITY_STOP", "Stop Play mode in the Unity Editor.", [], _stop, category="unity"),
    Command("UNITY_REFRESH_ASSETS", "Refresh/reimport assets in the Unity Editor (equivalent to Ctrl+R).", [], _refresh_assets, category="unity"),
]

for _cmd in _COMMANDS:
    registry.register(_cmd)
