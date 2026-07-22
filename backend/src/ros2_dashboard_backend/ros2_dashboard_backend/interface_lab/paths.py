"""Interface Lab의 paths 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from pathlib import Path


def backend_workspace_root() -> Path:
    """Interface Lab에서 요청된 처리를 수행하는 함수입니다."""
    return Path(__file__).resolve().parents[4]


def backend_python_package_root() -> Path:
    """Interface Lab에서 요청된 처리를 수행하는 함수입니다."""
    return (
        backend_workspace_root()
        / 'src'
        / 'ros2_dashboard_backend'
        / 'ros2_dashboard_backend'
    )


def reload_trigger_path() -> Path:
    """Interface Lab에서 필요한 ROS2 타입이나 설정을 불러오는 함수입니다."""
    return backend_python_package_root() / 'reload_trigger.py'
