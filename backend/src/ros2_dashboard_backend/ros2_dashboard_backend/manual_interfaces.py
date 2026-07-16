"""Manual interface registration and definition helpers."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ros2_dashboard_backend.interface_registry import (
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
    package_name = package.strip() or 'uploaded_interfaces'
    if not PACKAGE_NAME_PATTERN.fullmatch(package_name):
        raise InterfaceUploadError('package 이름은 소문자로 시작하고 소문자/숫자/_만 포함해야 합니다.')
    if package_name != 'uploaded_interfaces':
        raise InterfaceUploadError(
            '직접 작성은 backend/src/uploaded_interfaces 폴더에 타입 파일을 생성하는 기능입니다.',
        )
    if kind not in ALLOWED_KINDS:
        raise InterfaceUploadError('kind는 msg, srv, action 중 하나여야 합니다.')
    if not TYPE_NAME_PATTERN.fullmatch(type_name):
        raise InterfaceUploadError('type_name은 대문자로 시작하는 PascalCase여야 합니다.')
    raw_text = definition.strip() + '\n'
    if not raw_text.strip():
        raise InterfaceUploadError('definition을 입력하세요.')
    parsed = parse_interface(raw_text, kind)

    package_root = backend_workspace_root() / 'src' / package_name
    _ensure_uploaded_interfaces_package(package_root, package_name)
    file_name = f'{type_name}.{kind}'
    destination = package_root / kind / file_name
    destination.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write(destination, raw_text)
    dependencies = _dependency_candidates(raw_text, package_name)
    _regenerate_uploaded_cmake(package_root, package_name, dependencies)

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


def _ensure_uploaded_interfaces_package(package_root: Path, package_name: str) -> None:
    for folder in ('msg', 'srv', 'action'):
        (package_root / folder).mkdir(parents=True, exist_ok=True)
    package_xml = package_root / 'package.xml'
    if not package_xml.is_file():
        _atomic_write(package_xml, f'''<?xml version="1.0"?>
<package format="3">
  <name>{package_name}</name>
  <version>0.0.0</version>
  <description>User-authored interfaces from ros2_dashboard.</description>
  <maintainer email="user@example.com">ros2_dashboard</maintainer>
  <license>Apache-2.0</license>
  <buildtool_depend>ament_cmake</buildtool_depend>
  <build_depend>rosidl_default_generators</build_depend>
  <exec_depend>rosidl_default_runtime</exec_depend>
  <member_of_group>rosidl_interface_packages</member_of_group>
</package>
''')


def _regenerate_uploaded_cmake(
    package_root: Path,
    package_name: str,
    dependencies: list[str],
) -> None:
    interface_paths = []
    for folder, suffix in (('msg', '.msg'), ('srv', '.srv'), ('action', '.action')):
        interface_paths.extend(
            f'{folder}/{path.name}'
            for path in sorted((package_root / folder).glob(f'*{suffix}'))
        )
    dependency_lines = ''.join(f'find_package({name} REQUIRED)\n' for name in dependencies)
    dependency_arg = f'  DEPENDENCIES {" ".join(dependencies)}\n' if dependencies else ''
    interface_block = '\n'.join(f'  "{path}"' for path in interface_paths)
    cmake = f'''cmake_minimum_required(VERSION 3.8)
project({package_name})

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
