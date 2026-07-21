"""Manage uploaded ROS 2 interface packages."""

from __future__ import annotations

import importlib
import os
import re
import shutil
import stat
import tempfile
import zipfile
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default
from pathlib import Path, PurePosixPath
from typing import Any

import yaml

from ros2_dashboard_backend.interface_lab.paths import backend_workspace_root
from ros2_dashboard_backend.interface_lab.management.registry import (
    InterfaceUploadError,
    _dependency_candidates,
    _display_path,
    parse_interface,
)


MAX_PACKAGE_ZIP_SIZE = 8 * 1024 * 1024
MAX_PACKAGE_FILES = 200
MAX_PACKAGE_FILE_SIZE = 512 * 1024
PACKAGE_NAME_PATTERN = re.compile(r'^[a-z][a-z0-9_]*$')
PROJECT_PATTERN = re.compile(r'project\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\b', re.IGNORECASE)
PACKAGE_NAME_XML_PATTERN = re.compile(r'<name>\s*([^<]+)\s*</name>')
PACKAGE_LOCK = None


class InterfacePackageError(ValueError):
    """Raised when an uploaded interface package is invalid."""


def default_packages_registry_path() -> Path:
    """Return package registry path."""
    backend_root = backend_workspace_root()
    configured = Path(
        os.getenv('INTERFACE_PACKAGES_REGISTRY_PATH', 'config/interface_packages.yaml'),
    )
    return configured if configured.is_absolute() else backend_root / configured


def default_uploaded_packages_root() -> Path:
    """Return uploaded package storage root under the backend workspace."""
    backend_root = backend_workspace_root()
    configured = Path(
        os.getenv(
            'INTERFACE_UPLOADED_PACKAGES_PATH',
            'src/uploaded_interface_packages',
        ),
    )
    return configured if configured.is_absolute() else backend_root / configured


def upload_interface_package(
    file_name: str,
    content: bytes,
    *,
    replace: bool = False,
) -> dict[str, Any]:
    """Validate and store a zipped ROS 2 interface package."""
    safe_name = PurePosixPath(file_name.replace('\\', '/')).name
    if not safe_name.lower().endswith('.zip'):
        raise InterfacePackageError('zip 파일만 업로드할 수 있습니다.')
    if not content:
        raise InterfacePackageError('빈 zip 파일은 업로드할 수 없습니다.')
    if len(content) > MAX_PACKAGE_ZIP_SIZE:
        raise InterfacePackageError(
            f'패키지 zip 크기는 {MAX_PACKAGE_ZIP_SIZE // (1024 * 1024)}MB 이하여야 합니다.',
        )

    uploaded_root = default_uploaded_packages_root()
    uploaded_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='interface_package_') as temp_name:
        temp_root = Path(temp_name)
        zip_path = temp_root / safe_name
        zip_path.write_bytes(content)
        extract_root = temp_root / 'extract'
        extract_root.mkdir()
        _safe_extract_zip(zip_path, extract_root)
        package_root = _find_package_root(extract_root)
        return _store_package_root(package_root, replace=replace)


def extract_multipart_package_files(
    content_type: str,
    body: bytes,
) -> list[tuple[str, bytes]]:
    """Extract package folder files with their browser relative paths."""
    if not content_type.lower().startswith('multipart/form-data'):
        raise InterfacePackageError('multipart/form-data 요청이 필요합니다.')

    message = BytesParser(policy=default).parsebytes(
        b'Content-Type: ' + content_type.encode('ascii', errors='ignore')
        + b'\r\nMIME-Version: 1.0\r\n\r\n' + body,
    )
    if not message.is_multipart():
        raise InterfacePackageError('multipart 요청 형식을 읽을 수 없습니다.')

    files: list[tuple[str, bytes]] = []
    relative_paths: list[str] = []
    for part in message.iter_parts():
        name = part.get_param('name', header='content-disposition')
        payload = part.get_payload(decode=True) or b''
        if name == 'relative_path':
            relative_paths.append(payload.decode('utf-8', errors='ignore'))
        elif name == 'files' and part.get_filename():
            fallback = part.get_filename() or ''
            relative_path = part.get_param('filename', header='content-disposition') or fallback
            files.append((relative_path, payload))

    if relative_paths and len(relative_paths) == len(files):
        files = [(relative_paths[index], content) for index, (_, content) in enumerate(files)]
    if not files:
        raise InterfacePackageError('업로드할 package 폴더 파일이 없습니다.')
    return files


def upload_interface_package_folder(
    files: list[tuple[str, bytes]],
    *,
    replace: bool = False,
) -> dict[str, Any]:
    """Validate and store a browser folder upload as a ROS 2 interface package."""
    if len(files) > MAX_PACKAGE_FILES:
        raise InterfacePackageError(f'파일은 최대 {MAX_PACKAGE_FILES}개까지 허용합니다.')
    total_size = sum(len(content) for _, content in files)
    if total_size > MAX_PACKAGE_ZIP_SIZE:
        raise InterfacePackageError(
            f'패키지 폴더 총 크기는 {MAX_PACKAGE_ZIP_SIZE // (1024 * 1024)}MB 이하여야 합니다.',
        )

    with tempfile.TemporaryDirectory(prefix='interface_package_folder_') as temp_name:
        extract_root = Path(temp_name) / 'extract'
        extract_root.mkdir()
        for relative_path, content in files:
            relative = _safe_package_relative_path(relative_path, len(content))
            target = extract_root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        package_root = _find_package_root(extract_root)
        return _store_package_root(package_root, replace=replace)


def _store_package_root(package_root: Path, *, replace: bool) -> dict[str, Any]:
    uploaded_root = default_uploaded_packages_root()
    uploaded_root.mkdir(parents=True, exist_ok=True)
    package_name = _validate_package_identity(package_root)
    interfaces = _collect_interfaces(package_root, package_name)
    total_interfaces = sum(len(items) for items in interfaces.values())
    if total_interfaces == 0:
        raise InterfacePackageError('msg/srv/action 인터페이스가 하나 이상 필요합니다.')

    destination = uploaded_root / package_name
    if destination.exists() and not replace:
        raise InterfacePackageError(
            f'{package_name} 패키지가 이미 있습니다. replace=true로 다시 시도하세요.',
        )

    staging = uploaded_root / f'.{package_name}.staging'
    backup = uploaded_root / f'.{package_name}.backup'
    shutil.rmtree(staging, ignore_errors=True)
    shutil.rmtree(backup, ignore_errors=True)
    shutil.copytree(package_root, staging, symlinks=False)
    try:
        if destination.exists():
            destination.rename(backup)
        staging.rename(destination)
        shutil.rmtree(backup, ignore_errors=True)
    except OSError as exc:
        shutil.rmtree(destination, ignore_errors=True)
        if backup.exists():
            backup.rename(destination)
        shutil.rmtree(staging, ignore_errors=True)
        raise InterfacePackageError(f'패키지 저장에 실패했습니다: {exc}') from exc

    _rebase_interface_paths(interfaces, destination)
    entry = {
        'name': package_name,
        'path': _display_path(destination),
        'absolute_path': str(destination.resolve()),
        'source': 'uploaded_package',
        'uploaded_at': datetime.now(timezone.utc).isoformat(),
        'last_build_status': 'pending',
        'import_available': False,
        'import_error': None,
        'error': None,
        'dependency_candidates': sorted({
            dep for items in interfaces.values()
            for item in items
            for dep in item.get('dependency_candidates', [])
        }),
        'dependency_missing': [],
        'interfaces': interfaces,
        'rebuild_required': True,
    }
    registry = upsert_package_entry(entry)
    entry['registry_path'] = _display_path(default_packages_registry_path())
    entry['registry'] = registry
    return entry


def _rebase_interface_paths(
    interfaces: dict[str, list[dict[str, Any]]],
    package_root: Path,
) -> None:
    for items in interfaces.values():
        for item in items:
            relative = Path(str(item.get('relative_path') or ''))
            absolute = package_root / relative
            item['saved_path'] = _display_path(absolute)
            item['absolute_saved_path'] = str(absolute.resolve())


def packages_snapshot() -> dict[str, Any]:
    """Return normalized uploaded package registry."""
    return _load_packages_registry(default_packages_registry_path())


def delete_interface_package(package_name: str) -> dict[str, Any]:
    """Delete an uploaded interface package and remove it from the registry."""
    if not PACKAGE_NAME_PATTERN.fullmatch(package_name):
        raise InterfacePackageError('패키지명이 올바르지 않습니다.')
    destination = default_uploaded_packages_root() / package_name
    if destination.exists():
        shutil.rmtree(destination)
    registry = _load_packages_registry(default_packages_registry_path())
    registry['packages'] = [
        item for item in registry['packages']
        if item.get('name') != package_name
    ]
    _write_packages_registry(default_packages_registry_path(), registry)
    return {
        'name': package_name,
        'deleted': True,
        'rebuild_required': True,
        'registry': registry,
    }


def upsert_package_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """Insert or replace one package registry entry."""
    path = default_packages_registry_path()
    registry = _load_packages_registry(path)
    registry['packages'] = [
        item for item in registry['packages']
        if item.get('name') != entry.get('name')
    ]
    registry['packages'].append(entry)
    registry['packages'].sort(key=lambda item: str(item.get('name') or ''))
    _write_packages_registry(path, registry)
    return registry


def mark_packages_build_applied() -> dict[str, Any]:
    """Mark uploaded packages as built successfully."""
    path = default_packages_registry_path()
    registry = _load_packages_registry(path)
    built_at = datetime.now(timezone.utc).isoformat()
    for package in registry['packages']:
        package['last_build_status'] = 'success'
        package['last_build_at'] = built_at
        package['rebuild_required'] = False
    _write_packages_registry(path, registry)
    return registry


def refresh_package_imports() -> dict[str, Any]:
    """Refresh import availability for uploaded packages."""
    path = default_packages_registry_path()
    registry = _load_packages_registry(path)
    checked_at = datetime.now(timezone.utc).isoformat()
    for package in registry['packages']:
        errors: list[str] = []
        total = 0
        available_count = 0
        package_name = str(package.get('name') or '')
        for kind, items in _iter_package_interface_lists(package):
            for item in items:
                total += 1
                type_name = str(item.get('type_name') or '')
                available, error = _check_import(package_name, kind, type_name)
                item['import_available'] = available
                item['import_error'] = error
                item['import_checked_at'] = checked_at
                if available:
                    available_count += 1
                elif error:
                    errors.append(f'{item.get("type")}: {error}')
        package['import_available'] = total > 0 and available_count == total
        package['import_error'] = '; '.join(errors) if errors else None
        package['import_checked_at'] = checked_at
        if package['import_available']:
            package['rebuild_required'] = False
    summary = package_apply_summary(registry=registry, require_import_available=True)
    registry['apply_summary'] = summary
    _write_packages_registry(path, registry)
    return registry


def package_apply_summary(
    *,
    registry: dict[str, Any] | None = None,
    require_import_available: bool = False,
) -> dict[str, Any]:
    """Return apply readiness/import summary for uploaded packages."""
    registry = registry or _load_packages_registry(default_packages_registry_path())
    not_applied: list[dict[str, Any]] = []
    import_pending: list[dict[str, Any]] = []
    total = 0
    for package in registry['packages']:
        package_name = str(package.get('name') or '')
        package_path = Path(str(package.get('absolute_path') or ''))
        package_reasons: list[str] = []
        if not package_path.is_dir():
            package_reasons.append('package path missing')
        if not (package_path / 'package.xml').is_file():
            package_reasons.append('package.xml missing')
        if not (package_path / 'CMakeLists.txt').is_file():
            package_reasons.append('CMakeLists.txt missing')
        if package.get('error'):
            package_reasons.append(str(package['error']))

        for kind, items in _iter_package_interface_lists(package):
            for item in items:
                total += 1
                interface_path = Path(str(item.get('relative_path') or ''))
                actual_path = package_path / interface_path
                reasons = list(package_reasons)
                if not actual_path.is_file():
                    reasons.append('file_saved false')
                if not _cmake_contains_interface(package_path / 'CMakeLists.txt', item):
                    reasons.append('cmake_registered false')
                if require_import_available and item.get('import_available') is not True:
                    reasons.append('import_available false')
                elif not require_import_available and item.get('import_available') is not True:
                    import_pending.append({
                        'file_name': item.get('file_name'),
                        'type': item.get('type'),
                        'reason': item.get('import_error') or 'import-check pending after build',
                    })
                if reasons:
                    not_applied.append({
                        'file_name': item.get('file_name'),
                        'package_name': package_name,
                        'type': item.get('type'),
                        'saved_path': item.get('saved_path'),
                        'reason': ', '.join(reasons),
                    })
    real_apply_success = total > 0 and not not_applied
    ready_for_build = total > 0 and not any(
        item for item in not_applied
        if 'import_available false' not in item['reason']
    )
    return {
        'status': 'success' if real_apply_success else ('empty' if total == 0 else 'partial'),
        'real_apply_success': real_apply_success,
        'ready_for_build': ready_for_build,
        'registry_exists': default_packages_registry_path().is_file(),
        'registry_path': _display_path(default_packages_registry_path()),
        'uploaded_packages_path': _display_path(default_uploaded_packages_root()),
        'package_count': len(registry['packages']),
        'total': total,
        'applied_count': total - len(not_applied),
        'not_applied': not_applied,
        'import_pending': import_pending,
        'requires_import_available': require_import_available,
    }


def registered_package_services() -> list[dict[str, Any]]:
    """Return package-uploaded service entries for callable matching."""
    return _registered_package_interfaces('srv', 'service_type', 'request', 'response')


def registered_package_messages() -> list[dict[str, Any]]:
    """Return package-uploaded message entries for topic publish/subscribe."""
    entries = []
    for package in packages_snapshot()['packages']:
        for item in package.get('interfaces', {}).get('msg', []):
            entries.append({
                'source': 'uploaded_package',
                'package_name': package.get('name'),
                'file_name': item.get('file_name'),
                'type_name': item.get('type_name'),
                'message_type': item.get('type'),
                'message_schema': item.get('parsed', []) if isinstance(item.get('parsed'), list) else [],
                'saved_path': item.get('saved_path'),
                'import_available': item.get('import_available') is True,
                'import_error': item.get('import_error') or package.get('import_error'),
            })
    return entries


def registered_package_actions() -> list[dict[str, Any]]:
    """Return package-uploaded action entries for callable matching."""
    entries = []
    for package in packages_snapshot()['packages']:
        for item in package.get('interfaces', {}).get('action', []):
            parsed = item.get('parsed') if isinstance(item.get('parsed'), dict) else {}
            entries.append({
                'source': 'uploaded_package',
                'package_name': package.get('name'),
                'file_name': item.get('file_name'),
                'type_name': item.get('type_name'),
                'action_type': item.get('type'),
                'goal_schema': parsed.get('goal', []),
                'result_schema': parsed.get('result', []),
                'feedback_schema': parsed.get('feedback', []),
                'saved_path': item.get('saved_path'),
                'import_available': item.get('import_available') is True,
                'import_error': item.get('import_error') or package.get('import_error'),
            })
    return entries


def _registered_package_interfaces(
    kind: str,
    type_key: str,
    request_key: str,
    response_key: str,
) -> list[dict[str, Any]]:
    entries = []
    for package in packages_snapshot()['packages']:
        for item in package.get('interfaces', {}).get(kind, []):
            parsed = item.get('parsed') if isinstance(item.get('parsed'), dict) else {}
            entries.append({
                'source': 'uploaded_package',
                'package_name': package.get('name'),
                'file_name': item.get('file_name'),
                'type_name': item.get('type_name'),
                type_key: item.get('type'),
                'request_schema': parsed.get(request_key, []),
                'response_schema': parsed.get(response_key, []),
                'saved_path': item.get('saved_path'),
                'import_available': item.get('import_available') is True,
                'import_error': item.get('import_error') or package.get('import_error'),
            })
    return entries


def _safe_extract_zip(zip_path: Path, destination: Path) -> None:
    with zipfile.ZipFile(zip_path) as archive:
        infos = [info for info in archive.infolist() if not info.is_dir()]
        if len(infos) > MAX_PACKAGE_FILES:
            raise InterfacePackageError(f'파일은 최대 {MAX_PACKAGE_FILES}개까지 허용합니다.')
        for info in infos:
            relative = _safe_zip_member(info)
            if info.file_size > MAX_PACKAGE_FILE_SIZE:
                raise InterfacePackageError(f'파일이 너무 큽니다: {relative}')
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, target.open('wb') as output:
                shutil.copyfileobj(source, output)


def _safe_zip_member(info: zipfile.ZipInfo) -> PurePosixPath:
    mode = info.external_attr >> 16
    if stat.S_ISLNK(mode):
        raise InterfacePackageError(f'symlink는 허용하지 않습니다: {info.filename}')
    return _safe_package_relative_path(info.filename, info.file_size)


def _safe_package_relative_path(relative_path: str, file_size: int) -> PurePosixPath:
    path = PurePosixPath(relative_path.replace('\\', '/'))
    if path.is_absolute() or '..' in path.parts or '\x00' in relative_path:
        raise InterfacePackageError(f'허용되지 않는 package 경로입니다: {relative_path}')
    if any(part in {'build', 'install', 'log', '.git', '__pycache__'} for part in path.parts):
        raise InterfacePackageError(f'생성물/내부 폴더는 업로드할 수 없습니다: {relative_path}')
    if file_size > MAX_PACKAGE_FILE_SIZE:
        raise InterfacePackageError(f'파일이 너무 큽니다: {relative_path}')
    name = path.name
    allowed = (
        name in {'package.xml', 'CMakeLists.txt'}
        or name.lower().startswith(('readme', 'license'))
        or (len(path.parts) >= 2 and path.parts[-2] in {'msg', 'srv', 'action'} and path.suffix in {'.msg', '.srv', '.action'})
    )
    if not allowed:
        raise InterfacePackageError(f'허용되지 않는 파일입니다: {relative_path}')
    return path


def _find_package_root(extract_root: Path) -> Path:
    if (extract_root / 'package.xml').is_file():
        return extract_root
    children = [path for path in extract_root.iterdir() if path.is_dir()]
    if len(children) == 1 and (children[0] / 'package.xml').is_file():
        return children[0]
    raise InterfacePackageError('zip 내부에 package.xml을 포함한 최상위 패키지 폴더가 필요합니다.')


def _validate_package_identity(package_root: Path) -> str:
    package_xml = package_root / 'package.xml'
    cmake = package_root / 'CMakeLists.txt'
    if not package_xml.is_file():
        raise InterfacePackageError('package.xml이 필요합니다.')
    if not cmake.is_file():
        raise InterfacePackageError('CMakeLists.txt가 필요합니다.')
    package_match = PACKAGE_NAME_XML_PATTERN.search(package_xml.read_text(encoding='utf-8'))
    project_match = PROJECT_PATTERN.search(cmake.read_text(encoding='utf-8'))
    if not package_match:
        raise InterfacePackageError('package.xml에서 <name>을 찾을 수 없습니다.')
    if not project_match:
        raise InterfacePackageError('CMakeLists.txt에서 project(...)를 찾을 수 없습니다.')
    package_name = package_match.group(1).strip()
    project_name = project_match.group(1).strip()
    if package_name != project_name:
        raise InterfacePackageError('package.xml <name>과 CMakeLists.txt project(...)가 다릅니다.')
    if not PACKAGE_NAME_PATTERN.fullmatch(package_name):
        raise InterfacePackageError('패키지명은 소문자, 숫자, underscore만 사용할 수 있습니다.')
    return package_name


def _collect_interfaces(package_root: Path, package_name: str) -> dict[str, list[dict[str, Any]]]:
    interfaces: dict[str, list[dict[str, Any]]] = {'msg': [], 'srv': [], 'action': []}
    for kind in interfaces:
        directory = package_root / kind
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob(f'*.{kind}')):
            raw_text = path.read_text(encoding='utf-8')
            type_name = path.stem
            try:
                parsed = parse_interface(raw_text, kind)
                parsed_error = None
            except InterfaceUploadError as exc:
                parsed = {}
                parsed_error = str(exc)
            relative = path.relative_to(package_root)
            entry = {
                'file_name': path.name,
                'file_kind': kind,
                'type_name': type_name,
                'type': f'{package_name}/{kind}/{type_name}',
                'relative_path': relative.as_posix(),
                'saved_path': _display_path(path),
                'absolute_saved_path': str(path.resolve()),
                'raw_text': raw_text,
                'parsed': parsed,
                'parsed_error': parsed_error,
                'dependency_candidates': _dependency_candidates(raw_text, package_name),
                'import_available': False,
                'import_error': None,
            }
            interfaces[kind].append(entry)
    return interfaces


def _iter_package_interface_lists(package: dict[str, Any]):
    interfaces = package.get('interfaces') if isinstance(package.get('interfaces'), dict) else {}
    for kind in ('msg', 'srv', 'action'):
        items = interfaces.get(kind)
        if isinstance(items, list):
            yield kind, items


def _cmake_contains_interface(cmake_path: Path, item: dict[str, Any]) -> bool:
    try:
        text = cmake_path.read_text(encoding='utf-8')
    except (OSError, UnicodeError):
        return False
    relative = str(item.get('relative_path') or '')
    return bool(relative and (relative in text or f'"{relative}"' in text))


def _check_import(package_name: str, kind: str, type_name: str) -> tuple[bool, str | None]:
    try:
        importlib.invalidate_caches()
        module = importlib.import_module(f'{package_name}.{kind}')
        getattr(module, type_name)
        return True, None
    except (ImportError, AttributeError) as exc:
        return False, str(exc)


def _load_packages_registry(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {'packages': []}
    try:
        data = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise InterfacePackageError(f'패키지 registry를 읽을 수 없습니다: {exc}') from exc
    packages = data.get('packages') if isinstance(data, dict) else []
    return {'packages': packages if isinstance(packages, list) else []}


def _write_packages_registry(path: Path, registry: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_name = ''
    try:
        with tempfile.NamedTemporaryFile(
            mode='w', encoding='utf-8', dir=path.parent,
            prefix=f'.{path.name}.', delete=False,
        ) as temporary:
            temporary_name = temporary.name
            yaml.safe_dump(registry, temporary, allow_unicode=True, sort_keys=False)
        os.replace(temporary_name, path)
    except OSError as exc:
        if temporary_name:
            Path(temporary_name).unlink(missing_ok=True)
        raise InterfacePackageError(f'패키지 registry를 저장할 수 없습니다: {exc}') from exc
