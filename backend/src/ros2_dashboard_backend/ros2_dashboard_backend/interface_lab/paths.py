"""Stable filesystem roots for Interface Lab data and generated artifacts."""

from __future__ import annotations

from pathlib import Path


def backend_workspace_root() -> Path:
    """Return the ROS 2 backend workspace root, independent of module depth."""
    return Path(__file__).resolve().parents[4]


def backend_python_package_root() -> Path:
    """Return the ros2_dashboard_backend Python package source directory."""
    return (
        backend_workspace_root()
        / 'src'
        / 'ros2_dashboard_backend'
        / 'ros2_dashboard_backend'
    )


def reload_trigger_path() -> Path:
    """Return the Python file watched by uvicorn --reload."""
    return backend_python_package_root() / 'reload_trigger.py'
