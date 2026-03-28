"""
UNITY_SETUP — auto-install the Unika C# plugin into a Unity project.
No manual Unity steps required: the agent copies the plugin files,
Unity auto-recompiles, and the WebSocket bridge auto-connects.
"""
from __future__ import annotations
import shutil
from pathlib import Path
from typing import Any, Dict

from backend.commands import ArgSchema, Command, registry
from backend.events import bus

# Plugin source files (in unity-plugin/ directory)
_PLUGIN_SRC = Path(__file__).parent.parent.parent / "unity-plugin" / "Editor" / "Unika"


def _execute(args: Dict[str, Any]) -> str:
    project_path = Path(args["project_path"])

    # Validate Unity project
    assets_dir = project_path / "Assets"
    if not assets_dir.exists():
        return (
            f"[ERROR] '{project_path}' does not appear to be a Unity project "
            f"(no Assets/ directory found). Please provide the root Unity project folder."
        )

    # Destination: Assets/Editor/Unika/
    dest = assets_dir / "Editor" / "Unika"
    dest.mkdir(parents=True, exist_ok=True)

    # Check if plugin source exists
    if not _PLUGIN_SRC.exists():
        return (
            f"[ERROR] Plugin source not found at {_PLUGIN_SRC}. "
            "The unity-plugin/ directory may be missing."
        )

    # Copy plugin files
    copied = []
    for src_file in _PLUGIN_SRC.glob("*.cs"):
        dest_file = dest / src_file.name
        shutil.copy2(src_file, dest_file)
        copied.append(src_file.name)

    if not copied:
        return f"[ERROR] No C# files found in plugin source: {_PLUGIN_SRC}"

    # Emit event so the frontend can update project settings
    bus.emit({
        "type": "unity_setup_complete",
        "project_path": str(project_path),
        "plugin_path": str(dest),
        "files_copied": copied,
    })

    return (
        f"✅ Plugin instalado en {dest}\n"
        f"Archivos copiados: {', '.join(copied)}\n\n"
        f"⏳ Unity está recompilando los scripts. Espera unos segundos.\n"
        f"Una vez compilado, el bridge Unika estará disponible en el puerto 6400.\n"
        f"Puedes verificar la conexión en la barra de estado de Unika."
    )


registry.register(Command(
    name="UNITY_SETUP",
    description=(
        "Install the Unika bridge plugin into a Unity project automatically. "
        "Call this once to configure a project. Copies C# plugin files to Assets/Editor/Unika/, "
        "Unity auto-recompiles, and the WebSocket bridge connects automatically. "
        "No manual steps required."
    ),
    args=[
        ArgSchema("project_path", "string", "Root path of the Unity project (the folder containing Assets/, ProjectSettings/, etc.)"),
    ],
    executor=_execute,
    category="unity",
))
