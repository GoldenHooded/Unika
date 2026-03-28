"""
Unity project installer — auto-copies the Unika C# plugin into a Unity project.
Called by UNITY_SETUP command.
"""
# Implementation is in commands/unity_setup.py
# This module exists for future Unity-specific utilities (e.g. package manifest editing).

from pathlib import Path


def validate_unity_project(path: str) -> tuple[bool, str]:
    """Returns (is_valid, error_message)."""
    p = Path(path)
    if not p.exists():
        return False, f"Path does not exist: {path}"
    if not (p / "Assets").exists():
        return False, f"No Assets/ directory found in {path}"
    if not (p / "ProjectSettings").exists():
        return False, f"No ProjectSettings/ directory found in {path}"
    return True, ""


def get_unity_version(project_path: str) -> str:
    """Read Unity version from ProjectSettings/ProjectVersion.txt."""
    version_file = Path(project_path) / "ProjectSettings" / "ProjectVersion.txt"
    if not version_file.exists():
        return "Unknown"
    try:
        for line in version_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("m_EditorVersion:"):
                return line.split(":", 1)[1].strip()
    except Exception:
        pass
    return "Unknown"
