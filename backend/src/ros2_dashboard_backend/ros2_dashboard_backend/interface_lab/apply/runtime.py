"""Interface Lab의 runtime 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

import importlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from ros2_dashboard_backend.interface_lab.paths import (
    backend_workspace_root,
    reload_trigger_path,
)
from ros2_dashboard_backend.interface_lab.management.registry import (
    mark_registry_build_applied,
    registry_apply_summary,
    refresh_registry_imports,
)
from ros2_dashboard_backend.interface_lab.management.packages import (
    mark_packages_build_applied,
    package_apply_summary,
    packages_snapshot,
    refresh_package_imports,
)


_APPLY_LOCK = threading.Lock()
_STATUS_LOCK = threading.Lock()
_LOG_TAIL_LINES = 80
_PACKAGE_NAME_PATTERN = re.compile(r'^[a-z][a-z0-9_]*$')
_PACKAGE_NAME_XML_PATTERN = re.compile(r'<name>\s*([^<]+)\s*</name>')


class InterfaceApplyInProgress(RuntimeError):
    """Interface Lab의 InterfaceApplyInProgress 역할을 담당하는 클래스입니다."""


class InterfaceApplyError(RuntimeError):
    """Interface Lab에서 발생하는 예외를 표현하는 클래스입니다."""


def backend_workspace_path() -> Path:
    """Interface Lab에서 요청된 처리를 수행하는 함수입니다."""
    return backend_workspace_root()


def default_apply_status_path() -> Path:
    """Interface Lab에서 interface build/apply 상태를 처리하는 함수입니다."""
    backend_root = backend_workspace_path()
    configured = Path(
        os.getenv('INTERFACE_APPLY_STATUS_PATH', 'config/interface_apply_status.yaml'),
    )
    return configured if configured.is_absolute() else backend_root / configured


def default_apply_log_path() -> Path:
    """Interface Lab에서 interface build/apply 상태를 처리하는 함수입니다."""
    backend_root = backend_workspace_path()
    configured = Path(
        os.getenv('INTERFACE_APPLY_LOG_PATH', 'config/interface_apply_last.log'),
    )
    return configured if configured.is_absolute() else backend_root / configured


def apply_status() -> dict[str, Any]:
    """Interface Lab에서 interface build/apply 상태를 처리하는 함수입니다."""
    status = _read_status()
    status['running'] = _APPLY_LOCK.locked()
    status['log_tail'] = _read_log_tail(Path(status.get('log_path') or default_apply_log_path()))
    return status


def mark_interface_change_pending(message: str) -> dict[str, Any]:
    """Interface Lab에서 요청된 처리를 수행하는 함수입니다."""
    status = _read_status()
    status.update({
        'running': False,
        'status': 'rebuild_required',
        'build_status': 'rebuild_required',
        'real_apply_success': False,
        'build_required': True,
        'change_message': message,
        'changed_at': datetime.now(timezone.utc).isoformat(),
        'reload_scheduled': False,
    })
    _write_status(default_apply_status_path(), status)
    return status


def run_interface_apply() -> dict[str, Any]:
    """Interface Lab에서 interface build/apply 상태를 처리하는 함수입니다."""
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
        preflight = combined_apply_summary(require_import_available=False)
        blocking_not_applied = [
            item for item in preflight['not_applied']
            if 'import_available false' not in item['reason']
        ]
        if blocking_not_applied or preflight['total'] == 0:
            finished_at = datetime.now(timezone.utc).isoformat()
            message = (
                '등록된 interface 또는 interface package가 없습니다.'
                if preflight['total'] == 0
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

        uploaded_package_names = uploaded_interface_package_names()
        duplicates = duplicate_workspace_packages(workspace, uploaded_package_names)
        if duplicates:
            finished_at = datetime.now(timezone.utc).isoformat()
            message = '중복 ROS2 package가 감지되어 build를 중단했습니다.'
            duplicate_lines = [
                f'{name}: {", ".join(paths)}'
                for name, paths in sorted(duplicates.items())
            ]
            _write_text(
                log_path,
                '\n'.join([
                    f'started_at: {started_at}',
                    f'finished_at: {finished_at}',
                    f'workspace: {workspace}',
                    'command: skipped',
                    f'reason: {message}',
                    '',
                    '[duplicates]',
                    *duplicate_lines,
                    '',
                ]),
            )
            status = {
                'running': False,
                'status': 'failed',
                'build_status': 'skipped',
                'real_apply_success': False,
                'started_at': started_at,
                'finished_at': finished_at,
                'returncode': None,
                'workspace_path': str(workspace),
                'log_path': str(log_path),
                'reload_scheduled': False,
                'reload_trigger_path': str(trigger_path),
                'error': f'{message} {"; ".join(duplicate_lines)}',
                'summary': preflight,
                'not_applied': preflight['not_applied'],
                'install_python_paths': [],
                'install_python_paths_added': [],
                'import_check': None,
                'cleanup': {
                    'package_names': uploaded_package_names,
                    'removed': [],
                    'duplicates': duplicates,
                },
            }
            _write_status(status_path, status)
            status['log_tail'] = _read_log_tail(log_path)
            return status

        cleanup_result = cleanup_uploaded_package_build_artifacts(
            workspace,
            uploaded_package_names,
        )
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
            cleanup=cleanup_result,
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
            mark_packages_build_applied()
            path_refresh = refresh_install_python_paths(workspace)
            import_check = run_import_check_and_update_registry(workspace)
            summary = import_check['summary']
        else:
            summary = combined_apply_summary(require_import_available=False)
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
            'cleanup': cleanup_result,
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
            'summary': combined_apply_summary(require_import_available=False),
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
    """Interface Lab에서 필요한 ROS2 타입이나 설정을 불러오는 함수입니다."""
    time.sleep(delay_sec)
    timestamp = datetime.now(timezone.utc).isoformat()
    path = reload_trigger_path()
    _write_text(
        path,
        '\n'.join([
            '"""Interface apply build 후 uvicorn reload를 유도하는 전용 trigger 파일입니다."""',
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
    cleanup: dict[str, Any] | None = None,
) -> str:
    cleanup = cleanup or {'package_names': [], 'removed': [], 'duplicates': {}}
    return '\n'.join([
        f'started_at: {started_at}',
        f'finished_at: {finished_at}',
        f'workspace: {workspace}',
        f'command: {command}',
        f'returncode: {completed.returncode}',
        '',
        '[pre_build_cleanup]',
        f'package_names: {", ".join(cleanup.get("package_names", []))}',
        f'removed: {", ".join(cleanup.get("removed", []))}',
        '',
        '[stdout]',
        completed.stdout or '',
        '',
        '[stderr]',
        completed.stderr or '',
    ])


def uploaded_interface_package_names() -> list[str]:
    """Interface Lab에서 필요한 ROS2 타입이나 설정을 불러오는 함수입니다."""
    try:
        registry = packages_snapshot()
    except Exception:
        return []
    names = []
    for package in registry.get('packages', []):
        name = str(package.get('name') or '')
        if _PACKAGE_NAME_PATTERN.fullmatch(name):
            names.append(name)
    return sorted(set(names))


def cleanup_uploaded_package_build_artifacts(
    workspace: Path,
    package_names: list[str],
) -> dict[str, Any]:
    """Interface Lab에서 public API 응답 항목을 조립하는 함수입니다."""
    removed: list[str] = []
    for package_name in sorted(set(package_names)):
        if not _PACKAGE_NAME_PATTERN.fullmatch(package_name):
            continue
        for relative in (
            Path('build') / package_name,
            Path('install') / package_name,
            Path('log') / 'latest' / package_name,
            Path('log') / 'latest_build' / package_name,
        ):
            target = _safe_workspace_child(workspace, relative)
            if target.exists() or target.is_symlink():
                shutil.rmtree(target) if target.is_dir() and not target.is_symlink() else target.unlink()
                removed.append(_display_workspace_path(workspace, target))
    return {
        'package_names': sorted(set(package_names)),
        'removed': removed,
        'duplicates': {},
    }


def duplicate_workspace_packages(
    workspace: Path,
    package_names: list[str],
) -> dict[str, list[str]]:
    """Interface Lab에서 요청된 처리를 수행하는 함수입니다."""
    selected = set(package_names)
    if not selected:
        return {}
    found: dict[str, list[str]] = {name: [] for name in selected}
    src_root = _safe_workspace_child(workspace, Path('src'))
    if not src_root.is_dir():
        return {}
    for package_xml in src_root.glob('**/package.xml'):
        try:
            text = package_xml.read_text(encoding='utf-8')
        except (OSError, UnicodeError):
            continue
        match = _PACKAGE_NAME_XML_PATTERN.search(text)
        if not match:
            continue
        package_name = match.group(1).strip()
        if package_name in found:
            found[package_name].append(_display_workspace_path(workspace, package_xml.parent))
    return {
        name: sorted(paths)
        for name, paths in found.items()
        if len(paths) > 1
    }


def _safe_workspace_child(workspace: Path, relative: Path) -> Path:
    root = workspace.resolve()
    if relative.is_absolute() or '..' in relative.parts:
        raise InterfaceApplyError(f'workspace 밖 경로는 정리할 수 없습니다: {relative}')
    target = root / relative
    try:
        target.resolve().relative_to(root)
    except ValueError as exc:
        raise InterfaceApplyError(f'workspace 밖 경로는 정리할 수 없습니다: {target}') from exc
    return target


def _display_workspace_path(workspace: Path, path: Path) -> str:
    try:
        return path.relative_to(workspace.resolve()).as_posix()
    except ValueError:
        return str(path)


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
    """Interface Lab에서 runtime 상태를 갱신하는 함수입니다."""
    workspace = workspace_path or backend_workspace_path()
    path_refresh = refresh_install_python_paths(workspace)
    registry = refresh_registry_imports()
    package_registry = refresh_package_imports()
    summary = combined_apply_summary(
        registry_summary=registry.get('apply_summary'),
        package_summary=package_registry.get('apply_summary'),
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


def combined_apply_summary(
    *,
    registry_summary: dict[str, Any] | None = None,
    package_summary: dict[str, Any] | None = None,
    require_import_available: bool = False,
) -> dict[str, Any]:
    """Interface Lab에서 interface build/apply 상태를 처리하는 함수입니다."""
    single = registry_summary or registry_apply_summary(
        require_import_available=require_import_available,
    )
    packages = package_summary or package_apply_summary(
        require_import_available=require_import_available,
    )
    single_not_applied = list(single.get('not_applied', []))
    if single.get('total', 0) == 0 and packages.get('total', 0) > 0:
        single_not_applied = [
            item for item in single_not_applied
            if 'interface_registry.yaml 파일이 없습니다' not in str(item.get('reason', ''))
        ]
    not_applied = [
        *single_not_applied,
        *list(packages.get('not_applied', [])),
    ]
    total = int(single.get('total') or 0) + int(packages.get('total') or 0)
    import_pending = [
        *list(single.get('import_pending', [])),
        *list(packages.get('import_pending', [])),
    ]
    real_apply_success = total > 0 and not not_applied
    ready_for_build = total > 0 and not any(
        item for item in not_applied
        if 'import_available false' not in str(item.get('reason', ''))
    )
    status = 'success' if real_apply_success else ('empty' if total == 0 else 'partial')
    return {
        'status': status,
        'real_apply_success': real_apply_success,
        'ready_for_build': ready_for_build,
        'registry_exists': bool(single.get('registry_exists') or packages.get('registry_exists')),
        'single_registry': single,
        'package_registry': packages,
        'total': total,
        'applied_count': total - len(not_applied),
        'not_applied': not_applied,
        'import_pending': import_pending,
        'requires_import_available': require_import_available,
    }


def record_import_check_status(result: dict[str, Any]) -> dict[str, Any]:
    """Interface Lab에서 생성된 interface 타입 import 가능 여부를 확인하는 함수입니다."""
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
    """Interface Lab에서 요청된 처리를 수행하는 함수입니다."""
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
    """Interface Lab에서 요청된 처리를 수행하는 함수입니다."""
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
