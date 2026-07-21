"""Manual interface registration and definition helpers."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ros2_dashboard_backend.interface_lab.management.registry import (
    ALLOWED_KINDS,
    KIND_COLLECTIONS,
    TYPE_NAME_PATTERN,
    InterfaceUploadError,
    _atomic_write,
    _check_import,
    _dependency_candidates,
    _display_path,
    _load_registry,
    _write_registry,
    backend_workspace_root,
    default_registry_path,
    parse_interface,
)


PACKAGE_NAME_PATTERN = re.compile(r'^[a-z][a-z0-9_]*$')
FULL_TYPE_PATTERN = re.compile(
    r'^([A-Za-z][A-Za-z0-9_]*)/(msg|srv|action)/([A-Z][A-Za-z0-9]*)$',
)
FIELD_NAME_PATTERN = re.compile(r'^[a-z][A-Za-z0-9_]*$')
CONSTANT_NAME_PATTERN = re.compile(r'^[A-Za-z][A-Za-z0-9_]*$')
CUSTOM_TYPE_PATTERN = re.compile(
    r'^[A-Za-z][A-Za-z0-9_]*/(?:(?:msg|srv|action)/)?[A-Z][A-Za-z0-9_]*$',
)
PRIMITIVE_TYPES = {
    'bool',
    'byte',
    'char',
    'float32',
    'float64',
    'int8',
    'uint8',
    'int16',
    'uint16',
    'int32',
    'uint32',
    'int64',
    'uint64',
    'string',
    'wstring',
}


def register_manual_type(
    *,
    full_type: str,
    allowlisted: bool = True,
    description: str = '',
    registry_path: Path | None = None,
) -> dict[str, Any]:
    """Register an existing environment type without creating files."""
    package_name, kind, type_name = _parse_full_type(full_type)
    import_available, import_error = _check_import(package_name, kind, type_name)
    entry = {
        'file_name': f'{type_name}.{kind}',
        'file_kind': kind,
        'type_name': type_name,
        'full_type': full_type,
        'source': 'manual_type',
        'allowlisted': bool(allowlisted),
        'description': description,
        'uploaded_at': datetime.now(timezone.utc).isoformat(),
        'raw_text': '',
        'parsed': {},
        'build': {
            'interface_package': package_name,
            'file_saved': False,
            'cmake_registered': False,
            'package_xml_checked': False,
            'rebuild_required': False,
            'import_available': import_available,
            'import_error': import_error,
            'manual_registration': True,
            'error': None,
        },
    }
    _upsert_registry_entry(entry, registry_path)
    return entry


def write_manual_definition(
    *,
    package: str,
    kind: str,
    type_name: str,
    definition: str,
    registry_path: Path | None = None,
) -> dict[str, Any]:
    """Write a user-authored interface into backend/src/uploaded_interfaces."""
    validated = validate_manual_definition(
        package=package,
        kind=kind,
        type_name=type_name,
        definition=definition,
    )
    package_name = validated['package']
    kind = validated['kind']
    type_name = validated['type_name']
    raw_text = validated['raw_text']
    parsed = validated['parsed']

    package_root = backend_workspace_root() / 'src' / package_name
    _ensure_uploaded_interfaces_package(package_root, package_name)
    file_name = f'{type_name}.{kind}'
    destination = package_root / kind / file_name
    destination.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write(destination, raw_text)
    package_state = regenerate_uploaded_interfaces_package(package_root)
    dependencies = package_state['dependencies']

    import_available, import_error = _check_import(package_name, kind, type_name)
    entry = {
        'file_name': file_name,
        'file_kind': kind,
        'type_name': type_name,
        'full_type': f'{package_name}/{kind}/{type_name}',
        'source': 'manual_definition',
        'allowlisted': True,
        'uploaded_at': datetime.now(timezone.utc).isoformat(),
        'raw_text': raw_text,
        'parsed': parsed,
        'build': {
            'interface_package': package_name,
            'interface_package_path': _display_path(package_root),
            'absolute_interface_package_path': str(package_root),
            'saved_path': _display_path(destination),
            'absolute_saved_path': str(destination),
            'file_saved': True,
            'cmake_registered': True,
            'package_xml_checked': True,
            'dependency_candidates': dependencies,
            'rebuild_required': True,
            'import_available': import_available,
            'import_error': import_error,
            'error': None,
        },
    }
    _upsert_registry_entry(entry, registry_path)
    return entry


def update_manual_definition(
    *,
    kind: str,
    type_name: str,
    definition: str,
    registry_path: Path | None = None,
) -> dict[str, Any]:
    """Validate and overwrite an existing manual definition."""
    return write_manual_definition(
        package='uploaded_interfaces',
        kind=kind,
        type_name=type_name,
        definition=definition,
        registry_path=registry_path,
    )


def delete_manual_definition(
    *,
    kind: str,
    type_name: str,
    registry_path: Path | None = None,
) -> dict[str, Any]:
    """Delete one manual definition file and regenerate CMake from disk."""
    if kind not in ALLOWED_KINDS:
        raise InterfaceUploadError('kind는 msg, srv, action 중 하나여야 합니다.')
    if not TYPE_NAME_PATTERN.fullmatch(type_name):
        raise InterfaceUploadError('type_name은 대문자로 시작하는 PascalCase여야 합니다.')
    package_name = 'uploaded_interfaces'
    package_root = backend_workspace_root() / 'src' / package_name
    return delete_uploaded_interface(
        kind=kind,
        file_name=f'{type_name}.{kind}',
        full_type=f'{package_name}/{kind}/{type_name}',
        source='manual_definition',
        registry_path=registry_path,
    )


def rebuild_uploaded_interfaces_cmake() -> dict[str, Any]:
    """Regenerate uploaded_interfaces package metadata from actual files only."""
    package_name = 'uploaded_interfaces'
    package_root = backend_workspace_root() / 'src' / package_name
    package_state = regenerate_uploaded_interfaces_package(package_root)
    return {
        'package': package_name,
        'package_path': _display_path(package_root),
        **package_state,
        'rebuild_required': True,
    }


def delete_uploaded_interface(
    *,
    kind: str,
    file_name: str,
    source: str | None = None,
    full_type: str | None = None,
    registry_path: Path | None = None,
) -> dict[str, Any]:
    """Delete one single-file uploaded_interfaces entry and rebuild metadata."""
    if kind not in ALLOWED_KINDS:
        raise InterfaceUploadError('kind는 msg, srv, action 중 하나여야 합니다.')
    expected_suffix = f'.{kind}'
    if Path(file_name).name != file_name or not file_name.endswith(expected_suffix):
        raise InterfaceUploadError(f'file_name은 안전한 {expected_suffix} 파일명이어야 합니다.')

    path = registry_path or default_registry_path()
    registry = _load_registry(path)
    collection = registry['interface_registry'][KIND_COLLECTIONS[kind]]
    removed = next(
        (
            item for item in collection
            if item.get('file_name') == file_name
            and (source is None or item.get('source') == source)
            and (full_type is None or item.get('full_type') == full_type)
        ),
        None,
    )
    if removed is None:
        raise InterfaceUploadError('삭제할 registry 항목을 찾을 수 없습니다.')
    package_name = str(
        removed.get('build', {}).get('interface_package')
        or str(removed.get('full_type', '')).split('/', 1)[0]
    )
    if package_name != 'uploaded_interfaces':
        raise InterfaceUploadError('이 삭제 경로는 uploaded_interfaces 단일 파일만 지원합니다.')

    package_root = backend_workspace_root() / 'src' / package_name
    target = package_root / kind / file_name
    deleted_file = target.is_file()
    if deleted_file:
        target.unlink()
    package_state = regenerate_uploaded_interfaces_package(package_root)
    remove_uploaded_interface_registry_entry(
        kind=kind,
        file_name=file_name,
        source=removed.get('source'),
        full_type=removed.get('full_type'),
        registry_path=path,
    )
    return {
        'deleted_file': deleted_file,
        'file_deleted': deleted_file,
        'file_path': _display_path(target),
        'full_type': removed.get('full_type'),
        'removed': removed,
        **package_state,
        'rebuild_required': True,
        'build_required': True,
        'message': 'interface 파일과 registry 항목을 삭제하고 package metadata를 재생성했습니다.',
    }


def remove_uploaded_interface_registry_entry(
    *,
    kind: str,
    file_name: str,
    source: str | None,
    full_type: str | None,
    registry_path: Path | None = None,
) -> None:
    """Remove exactly one uploaded_interfaces registry record."""
    path = registry_path or default_registry_path()
    registry = _load_registry(path)
    collection = registry['interface_registry'][KIND_COLLECTIONS[kind]]
    collection[:] = [
        item for item in collection
        if not (
            item.get('file_name') == file_name
            and item.get('source') == source
            and item.get('full_type') == full_type
        )
    ]
    _write_registry(path, registry)


def validate_manual_definition(
    *,
    package: str,
    kind: str,
    type_name: str,
    definition: str,
) -> dict[str, Any]:
    """Validate a user-authored interface without writing files."""
    package_name = package.strip() or 'uploaded_interfaces'
    if not PACKAGE_NAME_PATTERN.fullmatch(package_name):
        raise InterfaceUploadError('validation_error: package 이름은 소문자로 시작하고 소문자/숫자/_만 포함해야 합니다.')
    if package_name != 'uploaded_interfaces':
        raise InterfaceUploadError('validation_error: 직접 작성은 uploaded_interfaces 패키지만 지원합니다.')
    if kind not in ALLOWED_KINDS:
        raise InterfaceUploadError('validation_error: kind는 msg, srv, action 중 하나여야 합니다.')
    if not TYPE_NAME_PATTERN.fullmatch(type_name):
        raise InterfaceUploadError('validation_error: type_name은 대문자로 시작하는 PascalCase여야 합니다.')
    raw_text = definition.strip() + '\n'
    if not raw_text.strip():
        raise InterfaceUploadError('validation_error: definition을 입력하세요.')
    separator_count = sum(
        1
        for line in raw_text.splitlines()
        if line.split('#', 1)[0].strip() == '---'
    )
    expected_separators = {'msg': 0, 'srv': 1, 'action': 2}[kind]
    if separator_count != expected_separators:
        raise InterfaceUploadError(
            f'validation_error: {kind}는 --- 구분선이 정확히 {expected_separators}개 필요합니다.',
        )
    parsed = parse_interface(raw_text, kind)
    _validate_parsed_fields(parsed, kind)
    return {
        'valid': True,
        'package': package_name,
        'kind': kind,
        'type_name': type_name,
        'raw_text': raw_text,
        'parsed': parsed,
    }


def _parse_full_type(full_type: str) -> tuple[str, str, str]:
    match = FULL_TYPE_PATTERN.fullmatch(full_type.strip())
    if not match:
        raise InterfaceUploadError('full_type 형식은 <package>/<msg|srv|action>/<TypeName> 이어야 합니다.')
    return match.group(1), match.group(2), match.group(3)


def _upsert_registry_entry(entry: dict[str, Any], registry_path: Path | None) -> None:
    path = registry_path or default_registry_path()
    registry = _load_registry(path)
    collection = registry['interface_registry'][KIND_COLLECTIONS[entry['file_kind']]]
    collection[:] = [
        item for item in collection
        if not (
            item.get('source') == entry.get('source')
            and item.get('full_type') == entry.get('full_type')
        )
    ]
    collection.append(entry)
    _write_registry(path, registry)


def _remove_registry_entry(*, kind: str, full_type: str, registry_path: Path | None) -> None:
    path = registry_path or default_registry_path()
    registry = _load_registry(path)
    collection = registry['interface_registry'][KIND_COLLECTIONS[kind]]
    collection[:] = [
        item for item in collection
        if not (item.get('source') == 'manual_definition' and item.get('full_type') == full_type)
    ]
    _write_registry(path, registry)


def _validate_parsed_fields(parsed: dict[str, Any], kind: str) -> None:
    sections = ['fields'] if kind == 'msg' else ['request', 'response'] if kind == 'srv' else ['goal', 'result', 'feedback']
    for section in sections:
        names: set[str] = set()
        for field in parsed.get(section, []):
            raw_line = field.get('raw_line', '')
            name = field.get('name')
            field_type = field.get('type')
            if not name or not field_type:
                raise InterfaceUploadError(f'validation_error: "{raw_line}" 줄은 "type name" 형식이어야 합니다.')
            if not _valid_interface_type(str(field_type)):
                raise InterfaceUploadError(f'validation_error: 알 수 없는 타입 "{field_type}"')
            name_pattern = CONSTANT_NAME_PATTERN if field.get('is_constant') else FIELD_NAME_PATTERN
            if not name_pattern.fullmatch(str(name)):
                raise InterfaceUploadError(f'validation_error: 필드명 "{name}" 형식이 올바르지 않습니다.')
            if name in names:
                raise InterfaceUploadError(f'validation_error: 중복 필드명 "{name}"')
            names.add(str(name))


def _valid_interface_type(field_type: str) -> bool:
    base = _strip_array_suffix(field_type)
    if '<=' in base:
        base = base.split('<=', 1)[0]
    return base in PRIMITIVE_TYPES or CUSTOM_TYPE_PATTERN.fullmatch(base) is not None


def _strip_array_suffix(field_type: str) -> str:
    value = field_type.strip()
    while value.endswith(']') and '[' in value:
        value = value[:value.rfind('[')]
    return value


def _ensure_uploaded_interfaces_package(package_root: Path, package_name: str) -> None:
    for folder in ('msg', 'srv', 'action'):
        (package_root / folder).mkdir(parents=True, exist_ok=True)


def scan_uploaded_interface_files(package_root: Path | None = None) -> list[str]:
    """Return the current msg/srv/action files in deterministic CMake order."""
    root = package_root or backend_workspace_root() / 'src' / 'uploaded_interfaces'
    interface_paths: list[str] = []
    for folder, suffix in (('msg', '.msg'), ('srv', '.srv'), ('action', '.action')):
        interface_paths.extend(
            f'{folder}/{path.name}'
            for path in sorted((root / folder).glob(f'*{suffix}'))
        )
    return interface_paths


def regenerate_uploaded_interfaces_package(package_root: Path | None = None) -> dict[str, Any]:
    """Rewrite CMakeLists.txt and package.xml from the files currently on disk."""
    root = package_root or backend_workspace_root() / 'src' / 'uploaded_interfaces'
    package_name = 'uploaded_interfaces'
    _ensure_uploaded_interfaces_package(root, package_name)
    interface_paths = scan_uploaded_interface_files(root)
    dependencies = _dependencies_from_existing_files(root, package_name)
    regenerate_uploaded_interfaces_cmake(root, interface_paths, dependencies)
    regenerate_uploaded_interfaces_package_xml(root, bool(interface_paths), dependencies)
    return {'interfaces': interface_paths, 'dependencies': dependencies}


def regenerate_uploaded_interfaces_cmake(
    package_root: Path,
    interface_paths: list[str],
    dependencies: list[str],
) -> None:
    """Completely rewrite CMakeLists.txt; never retain stale interface entries."""
    if not interface_paths:
        cmake = '''cmake_minimum_required(VERSION 3.8)
project(uploaded_interfaces)

find_package(ament_cmake REQUIRED)

ament_package()
'''
        _atomic_write(package_root / 'CMakeLists.txt', cmake)
        return
    dependency_lines = ''.join(f'find_package({name} REQUIRED)\n' for name in dependencies)
    dependency_arg = f'  DEPENDENCIES {" ".join(dependencies)}\n' if dependencies else ''
    interface_block = '\n'.join(f'  "{path}"' for path in interface_paths)
    cmake = f'''cmake_minimum_required(VERSION 3.8)
project(uploaded_interfaces)

find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
{dependency_lines}
rosidl_generate_interfaces(${{PROJECT_NAME}}
{interface_block}
{dependency_arg})

ament_export_dependencies(rosidl_default_runtime)
ament_package()
'''
    _atomic_write(package_root / 'CMakeLists.txt', cmake)


def regenerate_uploaded_interfaces_package_xml(
    package_root: Path,
    has_interfaces: bool,
    dependencies: list[str],
) -> None:
    """Completely rewrite package.xml to match an interface or empty package."""
    rosidl_dependencies = ''
    if has_interfaces:
        dependency_tags = ''.join(f'  <depend>{name}</depend>\n' for name in dependencies)
        rosidl_dependencies = f'''  <build_depend>rosidl_default_generators</build_depend>
  <exec_depend>rosidl_default_runtime</exec_depend>
{dependency_tags}  <member_of_group>rosidl_interface_packages</member_of_group>
'''
    _atomic_write(package_root / 'package.xml', f'''<?xml version="1.0"?>
<package format="3">
  <name>uploaded_interfaces</name>
  <version>0.0.0</version>
  <description>User-authored interfaces from ros2_dashboard.</description>
  <maintainer email="user@example.com">ros2_dashboard</maintainer>
  <license>Apache-2.0</license>
  <buildtool_depend>ament_cmake</buildtool_depend>
{rosidl_dependencies}
</package>
''')


def _existing_interface_paths(package_root: Path) -> list[str]:
    return scan_uploaded_interface_files(package_root)


def _dependencies_from_existing_files(package_root: Path, package_name: str) -> list[str]:
    dependencies: set[str] = set()
    for relative_path in _existing_interface_paths(package_root):
        file_path = package_root / relative_path
        dependencies.update(_dependency_candidates(file_path.read_text(encoding='utf-8'), package_name))
    return sorted(dependencies)
