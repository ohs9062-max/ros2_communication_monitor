"""Build and reload helpers for uploaded ROS 2 interface definitions."""

from __future__ import annotations

import importlib
import os
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from ros2_dashboard_backend.interface_registry import (
    mark_registry_build_applied,
    registry_apply_summary,
    refresh_registry_imports,
)


_APPLY_LOCK = threading.Lock()
_STATUS_LOCK = threading.Lock()
_LOG_TAIL_LINES = 80


class InterfaceApplyInProgress(RuntimeError):
    """Raised when an interface apply build is already running."""


class InterfaceApplyError(RuntimeError):
    """Raised when interface apply status cannot be persisted."""


def backend_workspace_path() -> Path:
    """Return the backend workspace root."""
    return Path(__file__).resolve().parents[3]


def default_apply_status_path() -> Path:
    """Return the persisted apply status file path."""
    backend_root = backend_workspace_path()
    configured = Path(
        os.getenv('INTERFACE_APPLY_STATUS_PATH', 'config/interface_apply_status.yaml'),
    )
    return configured if configured.is_absolute() else backend_root / configured


def default_apply_log_path() -> Path:
    """Return the persisted latest apply build log path."""
    backend_root = backend_workspace_path()
    configured = Path(
        os.getenv('INTERFACE_APPLY_LOG_PATH', 'config/interface_apply_last.log'),
    )
    return configured if configured.is_absolute() else backend_root / configured


def reload_trigger_path() -> Path:
    """Return the Python file watched by uvicorn --reload."""
    return Path(__file__).resolve().parent / 'reload_trigger.py'


def apply_status() -> dict[str, Any]:
    """Return the latest persisted apply status, including log tail."""
    status = _read_status()
    status['running'] = _APPLY_LOCK.locked()
    status['log_tail'] = _read_log_tail(Path(status.get('log_path') or default_apply_log_path()))
    return status


def run_interface_apply() -> dict[str, Any]:
    """Run colcon build for the backend workspace and persist the result."""
    if not _APPLY_LOCK.acquire(blocking=False):
        raise InterfaceApplyInProgress('이미 적용하기 빌드가 실행 중입니다.')

    started_at = datetime.now(timezone.utc).isoformat()
    workspace = backend_workspace_path()
    log_path = default_apply_log_path()
    status_path = default_apply_status_path()
    trigger_path = reload_trigger_path()
    _write_status(
        status_path,
        {
            'running': True,
            'status': 'running',
            'build_status': 'running',
            'real_apply_success': False,
            'started_at': started_at,
            'finished_at': None,
            'returncode': None,
            'workspace_path': str(workspace),
            'log_path': str(log_path),
            'reload_scheduled': False,
            'reload_trigger_path': str(trigger_path),
            'error': None,
            'summary': None,
            'not_applied': [],
            'install_python_paths': [],
            'install_python_paths_added': [],
            'import_check': None,
        },
    )

    command = 'source /opt/ros/jazzy/setup.bash && colcon build --symlink-install'
    try:
        preflight = registry_apply_summary(require_import_available=False)
        blocking_not_applied = [
            item for item in preflight['not_applied']
            if 'import_available false' not in item['reason']
        ]
        if not preflight['registry_exists'] or blocking_not_applied or preflight['total'] == 0:
            finished_at = datetime.now(timezone.utc).isoformat()
            message = (
                'interface_registry.yaml 파일이 없습니다.'
                if not preflight['registry_exists']
                else '일부 interface가 파일 생성 또는 CMake 등록되지 않았습니다.'
            )
            _write_text(
                log_path,
                '\n'.join([
                    f'started_at: {started_at}',
                    f'finished_at: {finished_at}',
                    f'workspace: {workspace}',
                    'command: skipped',
                    f'reason: {message}',
                    '',
                ]),
            )
            status = {
                'running': False,
                'status': 'partial',
                'build_status': 'skipped',
                'real_apply_success': False,
                'started_at': started_at,
                'finished_at': finished_at,
                'returncode': None,
                'workspace_path': str(workspace),
                'log_path': str(log_path),
                'reload_scheduled': False,
                'reload_trigger_path': str(trigger_path),
                'error': message,
                'summary': preflight,
                'not_applied': preflight['not_applied'],
                'install_python_paths': [],
                'install_python_paths_added': [],
                'import_check': None,
            }
            _write_status(status_path, status)
            status['log_tail'] = _read_log_tail(log_path)
            return status

        completed = subprocess.run(
            ['/bin/bash', '-lc', command],
            cwd=workspace,
            capture_output=True,
            check=False,
            text=True,
        )
        finished_at = datetime.now(timezone.utc).isoformat()
        output = _format_build_log(
            command=command,
            completed=completed,
            started_at=started_at,
            finished_at=finished_at,
            workspace=workspace,
        )
        _write_text(log_path, output)
        build_success = completed.returncode == 0
        import_check: dict[str, Any] | None = None
        path_refresh = {
            'site_packages': [],
            'added': [],
        }
        if build_success:
            mark_registry_build_applied()
            path_refresh = refresh_install_python_paths(workspace)
            import_check = run_import_check_and_update_registry(workspace)
            summary = import_check['summary']
        else:
            summary = registry_apply_summary(require_import_available=False)
        real_apply_success = build_success and bool(summary['real_apply_success'])
        status_name = 'success' if real_apply_success else 'partial'
        if not build_success:
            status_name = 'failed'
        elif not path_refresh['site_packages']:
            status_name = 'import_failed'
        elif not real_apply_success:
            status_name = 'import_failed'
        status = {
            'running': False,
            'status': status_name,
            'build_status': 'success' if build_success else 'failed',
            'real_apply_success': real_apply_success,
            'started_at': started_at,
            'finished_at': finished_at,
            'returncode': completed.returncode,
            'workspace_path': str(workspace),
            'log_path': str(log_path),
            'reload_scheduled': real_apply_success,
            'reload_trigger_path': str(trigger_path),
            'error': None if real_apply_success else (
                'colcon build failed'
                if not build_success
                else '빌드는 성공했지만 현재 backend 프로세스에서 import 확인에 실패했습니다.'
            ),
            'summary': summary,
            'not_applied': summary['not_applied'],
            'install_python_paths': path_refresh['site_packages'],
            'install_python_paths_added': path_refresh['added'],
            'import_check': import_check,
        }
        _write_status(status_path, status)
        status['log_tail'] = _read_log_tail(log_path)
        return status
    except OSError as exc:
        finished_at = datetime.now(timezone.utc).isoformat()
        _write_text(
            log_path,
            '\n'.join([
                f'started_at: {started_at}',
                f'finished_at: {finished_at}',
                f'workspace: {workspace}',
                f'command: {command}',
                f'error: {exc}',
                '',
            ]),
        )
        status = {
            'running': False,
            'status': 'failed',
            'build_status': 'failed',
            'real_apply_success': False,
            'started_at': started_at,
            'finished_at': finished_at,
            'returncode': None,
            'workspace_path': str(workspace),
            'log_path': str(log_path),
            'reload_scheduled': False,
            'reload_trigger_path': str(trigger_path),
            'error': str(exc),
            'summary': registry_apply_summary(require_import_available=False),
            'not_applied': [],
            'install_python_paths': [],
            'install_python_paths_added': [],
            'import_check': None,
        }
        status['not_applied'] = status['summary']['not_applied']
        _write_status(status_path, status)
        status['log_tail'] = _read_log_tail(log_path)
        return status
    finally:
        _APPLY_LOCK.release()


def touch_reload_trigger_after_delay(delay_sec: float = 0.75) -> None:
    """Update the reload trigger after the API response has been sent."""
    time.sleep(delay_sec)
    timestamp = datetime.now(timezone.utc).isoformat()
    path = reload_trigger_path()
    _write_text(
        path,
        '\n'.join([
            '"""Dedicated uvicorn reload trigger for interface apply builds."""',
            '',
            f'RELOAD_VERSION = {timestamp!r}',
            '',
        ]),
    )


def _format_build_log(
    *,
    command: str,
    completed: subprocess.CompletedProcess[str],
    started_at: str,
    finished_at: str,
    workspace: Path,
) -> str:
    return '\n'.join([
        f'started_at: {started_at}',
        f'finished_at: {finished_at}',
        f'workspace: {workspace}',
        f'command: {command}',
        f'returncode: {completed.returncode}',
        '',
        '[stdout]',
        completed.stdout or '',
        '',
        '[stderr]',
        completed.stderr or '',
    ])


def _empty_status() -> dict[str, Any]:
    workspace = backend_workspace_path()
    log_path = default_apply_log_path()
    return {
        'running': False,
        'status': 'idle',
        'build_status': 'idle',
        'real_apply_success': False,
        'started_at': None,
        'finished_at': None,
        'returncode': None,
        'workspace_path': str(workspace),
        'log_path': str(log_path),
        'reload_scheduled': False,
        'reload_trigger_path': str(reload_trigger_path()),
        'error': None,
        'summary': None,
        'not_applied': [],
        'install_python_paths': [],
        'install_python_paths_added': [],
        'import_check': None,
    }


def run_import_check_and_update_registry(workspace_path: Path | None = None) -> dict[str, Any]:
    """Refresh install import paths and persist generated interface import state."""
    workspace = workspace_path or backend_workspace_path()
    path_refresh = refresh_install_python_paths(workspace)
    registry = refresh_registry_imports()
    summary = registry.get('apply_summary') or registry_apply_summary(
        require_import_available=True,
    )
    return {
        'real_apply_success': bool(summary['real_apply_success']),
        'status': summary['status'],
        'summary': summary,
        'not_applied': summary['not_applied'],
        'install_python_paths': path_refresh['site_packages'],
        'install_python_paths_added': path_refresh['added'],
    }


def record_import_check_status(result: dict[str, Any]) -> dict[str, Any]:
    """Merge a standalone import-check result into the persisted apply status."""
    status = _read_status()
    status['real_apply_success'] = bool(result.get('real_apply_success'))
    if status.get('build_status') == 'success':
        status['status'] = 'success' if result.get('real_apply_success') else 'import_failed'
        status['reload_scheduled'] = bool(result.get('real_apply_success'))
        status['error'] = None if result.get('real_apply_success') else (
            '빌드는 성공했지만 현재 backend 프로세스에서 import 확인에 실패했습니다.'
        )
    status['summary'] = result.get('summary')
    status['not_applied'] = result.get('not_applied', [])
    status['install_python_paths'] = result.get('install_python_paths', [])
    status['install_python_paths_added'] = result.get('install_python_paths_added', [])
    status['import_check'] = result
    _write_status(default_apply_status_path(), status)
    status['log_tail'] = _read_log_tail(Path(status.get('log_path') or default_apply_log_path()))
    return status


def refresh_install_python_paths(workspace_path: Path | None = None) -> dict[str, list[str]]:
    """Add generated install site-packages paths to the current process."""
    paths = find_install_site_packages(workspace_path or backend_workspace_path())
    added: list[str] = []
    for path in reversed(paths):
        value = str(path)
        if value not in sys.path:
            sys.path.insert(0, value)
            added.append(value)
    importlib.invalidate_caches()
    return {
        'site_packages': [str(path) for path in paths],
        'added': added,
    }


def find_install_site_packages(workspace_path: Path | None = None) -> list[Path]:
    """Find Python site-packages directories generated under install/."""
    workspace = workspace_path or backend_workspace_path()
    install_root = workspace / 'install'
    current = f'python{sys.version_info.major}.{sys.version_info.minor}'
    candidates = [
        path.resolve()
        for path in install_root.glob('*/lib/python*/site-packages')
        if path.is_dir()
    ]
    return sorted(
        candidates,
        key=lambda path: (
            0 if path.parent.name == current else 1,
            path.as_posix(),
        ),
    )


def _read_status() -> dict[str, Any]:
    path = default_apply_status_path()
    if not path.is_file():
        return _empty_status()
    try:
        data = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise InterfaceApplyError(f'적용 상태를 읽을 수 없습니다: {exc}') from exc
    status = _empty_status()
    if isinstance(data, dict):
        status.update(data)
    return status


def _write_status(path: Path, status: dict[str, Any]) -> None:
    with _STATUS_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_name = ''
        try:
            with tempfile.NamedTemporaryFile(
                mode='w', encoding='utf-8', dir=path.parent,
                prefix=f'.{path.name}.', delete=False,
            ) as temporary:
                temporary_name = temporary.name
                yaml.safe_dump(status, temporary, allow_unicode=True, sort_keys=False)
            os.replace(temporary_name, path)
        except OSError as exc:
            if temporary_name:
                Path(temporary_name).unlink(missing_ok=True)
            raise InterfaceApplyError(f'적용 상태를 저장할 수 없습니다: {exc}') from exc


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_name = ''
    with tempfile.NamedTemporaryFile(
        mode='w', encoding='utf-8', dir=path.parent,
        prefix=f'.{path.name}.', delete=False,
    ) as temporary:
        temporary_name = temporary.name
        temporary.write(content)
    os.replace(temporary_name, path)


def _read_log_tail(path: Path) -> str:
    if not path.is_file():
        return ''
    try:
        lines = path.read_text(encoding='utf-8', errors='replace').splitlines()
    except OSError:
        return ''
    return '\n'.join(lines[-_LOG_TAIL_LINES:])
