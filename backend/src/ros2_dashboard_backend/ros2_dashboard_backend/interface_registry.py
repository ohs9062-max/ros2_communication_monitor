"""Parse and persist uploaded ROS 2 interface definition files."""

from __future__ import annotations

import importlib
import os
import re
import shutil
import sys
import tempfile
import threading
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default
from pathlib import Path, PurePath
from typing import Any

import yaml


ALLOWED_KINDS = {'msg', 'srv', 'action'}
KIND_COLLECTIONS = {
    'msg': 'messages',
    'srv': 'services',
    'action': 'actions',
}
MAX_INTERFACE_FILE_SIZE = 256 * 1024
_REGISTRY_LOCK = threading.Lock()
TYPE_NAME_PATTERN = re.compile(r'^[A-Z][A-Za-z0-9]*$')
DEPENDENCY_PATTERN = re.compile(
    r'(?<![A-Za-z0-9_])([A-Za-z][A-Za-z0-9_]*)/'
    r'[A-Za-z][A-Za-z0-9_]*(?:\[[^]]*\])?',
)


class InterfaceUploadError(ValueError):
    """Raised when an uploaded interface file is invalid."""


def default_registry_path() -> Path:
    """Return the registry path without coupling it to monitor.yaml."""
    backend_root = Path(__file__).resolve().parents[3]
    configured = Path(
        os.getenv('INTERFACE_REGISTRY_PATH', 'config/interface_registry.yaml'),
    )
    return configured if configured.is_absolute() else backend_root / configured


def default_interface_package() -> tuple[str, Path]:
    """Return the configured, existing ROS interface package."""
    backend_root = Path(__file__).resolve().parents[3]
    package_name = os.getenv(
        'INTERFACE_PACKAGE_NAME', 'ros2_dashboard_interfaces',
    ).strip()
    configured = Path(os.getenv('INTERFACE_PACKAGE_PATH', f'src/{package_name}'))
    package_path = configured if configured.is_absolute() else backend_root / configured
    return package_name, package_path.resolve()


def extract_multipart_file(content_type: str, body: bytes) -> tuple[str, bytes]:
    """Extract the first named file part using only the standard library."""
    if not content_type.lower().startswith('multipart/form-data'):
        raise InterfaceUploadError('multipart/form-data 요청이 필요합니다.')

    message = BytesParser(policy=default).parsebytes(
        b'Content-Type: ' + content_type.encode('ascii', errors='ignore')
        + b'\r\nMIME-Version: 1.0\r\n\r\n' + body,
    )
    if not message.is_multipart():
        raise InterfaceUploadError('multipart 요청 형식을 읽을 수 없습니다.')

    for part in message.iter_parts():
        file_name = part.get_filename()
        if file_name:
            payload = part.get_payload(decode=True) or b''
            return file_name, payload
    raise InterfaceUploadError('업로드할 파일이 없습니다.')


def register_interface(
    file_name: str,
    content: bytes,
    registry_path: Path | None = None,
) -> dict[str, Any]:
    """Validate, parse, and upsert one interface definition."""
    safe_name = _safe_file_name(file_name)
    suffix = Path(safe_name).suffix.lower()
    kind = suffix.removeprefix('.')
    if kind not in ALLOWED_KINDS:
        raise InterfaceUploadError('.msg, .srv, .action 파일만 업로드할 수 있습니다.')
    if not content:
        raise InterfaceUploadError('빈 파일은 업로드할 수 없습니다.')
    if len(content) > MAX_INTERFACE_FILE_SIZE:
        raise InterfaceUploadError(
            f'파일 크기는 {MAX_INTERFACE_FILE_SIZE // 1024}KB 이하여야 합니다.',
        )
    try:
        raw_text = content.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise InterfaceUploadError('파일은 UTF-8 텍스트여야 합니다.') from exc

    type_name = Path(safe_name).stem
    if not TYPE_NAME_PATTERN.fullmatch(type_name):
        raise InterfaceUploadError(
            '타입 이름은 대문자로 시작하고 영문자와 숫자만 포함해야 합니다.',
        )

    entry: dict[str, Any] = {
        'file_name': safe_name,
        'file_kind': kind,
        'type_name': type_name,
        'uploaded_at': datetime.now(timezone.utc).isoformat(),
        'raw_text': raw_text,
    }
    try:
        entry['parsed'] = parse_interface(raw_text, kind)
    except InterfaceUploadError as exc:
        entry['parsed'] = {}
        entry['parsed_error'] = str(exc)

    path = registry_path or default_registry_path()
    with _REGISTRY_LOCK:
        registry = _load_registry(path)
        collection = registry['interface_registry'][KIND_COLLECTIONS[kind]]
        previous = next(
            (item for item in collection if item.get('file_name') == safe_name),
            None,
        )
        entry['status'] = 'updated' if previous else 'created'
        try:
            entry['build'] = _install_interface(safe_name, kind, type_name, raw_text)
        except InterfaceUploadError as exc:
            entry['build'] = _failed_build_info(raw_text, str(exc))
        collection[:] = [
            item for item in collection
            if item.get('file_name') != safe_name
        ]
        collection.append(entry)
        _write_registry(path, registry)
        if not path.is_file():
            raise InterfaceUploadError(f'타입 registry 파일이 생성되지 않았습니다: {path}')
        entry['registry_path'] = _display_path(path)
    return entry


def _install_interface(
    safe_name: str, kind: str, type_name: str, raw_text: str,
) -> dict[str, Any]:
    package_name, package_path = default_interface_package()
    package_xml = package_path / 'package.xml'
    cmake_path = package_path / 'CMakeLists.txt'
    if (
        not package_path.is_dir()
        or not package_xml.is_file()
        or not cmake_path.is_file()
    ):
        raise InterfaceUploadError(
            f'interface 패키지 구성을 찾을 수 없습니다: {package_path}',
        )

    declared_name = re.search(
        r'<name>\s*([^<]+)\s*</name>',
        package_xml.read_text(encoding='utf-8'),
    )
    if not declared_name or declared_name.group(1).strip() != package_name:
        raise InterfaceUploadError('INTERFACE_PACKAGE_NAME과 package.xml의 패키지명이 다릅니다.')

    dependencies = _dependency_candidates(raw_text, package_name)
    destination = package_path / kind / safe_name
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        _atomic_write(destination, raw_text)
        cmake_changed = _update_cmake(cmake_path, f'{kind}/{safe_name}', dependencies)
        package_changed = _update_package_xml(package_xml, dependencies)
    except (OSError, UnicodeError) as exc:
        raise InterfaceUploadError(f'interface 패키지 반영에 실패했습니다: {exc}') from exc

    import_available, import_error = _check_import(package_name, kind, type_name)
    backend_root = Path(__file__).resolve().parents[3]
    saved_path = _display_path(destination)
    return {
        'interface_package': package_name,
        'saved_path': saved_path,
        'absolute_saved_path': str(destination),
        'file_saved': True,
        'cmake_registered': True,
        'cmake_updated': cmake_changed,
        'package_xml_checked': True,
        'package_xml_updated': package_changed,
        'dependency_candidates': dependencies,
        'rebuild_required': True,
        'import_available': import_available,
        'import_error': import_error,
        'error': None,
    }


def _failed_build_info(raw_text: str, error: str) -> dict[str, Any]:
    package_name, _ = default_interface_package()
    return {
        'interface_package': package_name,
        'saved_path': None,
        'file_saved': False,
        'cmake_registered': False,
        'package_xml_checked': False,
        'dependency_candidates': _dependency_candidates(raw_text, package_name),
        'rebuild_required': False,
        'import_available': False,
        'import_error': None,
        'error': error,
    }


def _dependency_candidates(raw_text: str, package_name: str) -> list[str]:
    without_comments = '\n'.join(
        line.split('#', 1)[0] for line in raw_text.splitlines()
    )
    return sorted({
        match for match in DEPENDENCY_PATTERN.findall(without_comments)
        if match != package_name
    })


def _update_cmake(path: Path, interface_path: str, dependencies: list[str]) -> bool:
    text = path.read_text(encoding='utf-8')
    match = re.search(r'rosidl_generate_interfaces\s*\(', text)
    if not match:
        raise InterfaceUploadError('CMakeLists.txt에 rosidl_generate_interfaces 블록이 없습니다.')
    end = _closing_parenthesis(text, match.end() - 1)
    block = text[match.start():end + 1]
    updated = block
    if f'"{interface_path}"' not in updated and interface_path not in updated:
        dependency_position = re.search(r'^\s*DEPENDENCIES\b', updated, re.MULTILINE)
        insertion = dependency_position.start() if dependency_position else updated.rfind(')')
        updated = updated[:insertion] + f'  "{interface_path}"\n' + updated[insertion:]
    for dependency in dependencies:
        if not re.search(
            rf'\b{re.escape(dependency)}\b', _dependencies_section(updated),
        ):
            dep_match = re.search(r'^(\s*DEPENDENCIES\b[^\n]*)', updated, re.MULTILINE)
            if dep_match:
                line = dep_match.group(1) + f' {dependency}'
                updated = updated[:dep_match.start()] + line + updated[dep_match.end():]
            else:
                updated = updated[:-1] + f'  DEPENDENCIES {dependency}\n)'
    prefix = ''
    for dependency in dependencies:
        if not re.search(
            rf'find_package\s*\(\s*{re.escape(dependency)}\s+REQUIRED\s*\)',
            text,
        ):
            prefix += f'find_package({dependency} REQUIRED)\n'
    result = text[:match.start()] + prefix + updated + text[end + 1:]
    if result == text:
        return False
    _backup(path)
    _atomic_write(path, result)
    return True


def _dependencies_section(block: str) -> str:
    match = re.search(r'\bDEPENDENCIES\b(.*)', block, re.DOTALL)
    return match.group(1) if match else ''


def _closing_parenthesis(text: str, opening: int) -> int:
    depth = 0
    for index in range(opening, len(text)):
        if text[index] == '(':
            depth += 1
        elif text[index] == ')':
            depth -= 1
            if depth == 0:
                return index
    raise InterfaceUploadError('rosidl_generate_interfaces 블록이 닫히지 않았습니다.')


def _update_package_xml(path: Path, dependencies: list[str]) -> bool:
    text = path.read_text(encoding='utf-8')
    additions: list[str] = []
    required = [
        ('build_depend', 'rosidl_default_generators'),
        ('exec_depend', 'rosidl_default_runtime'),
    ]
    for tag, name in required:
        if not re.search(
            rf'<(?:{tag}|depend)>\s*{re.escape(name)}\s*'
            rf'</(?:{tag}|depend)>',
            text,
        ):
            additions.append(f'  <{tag}>{name}</{tag}>')
    for dependency in dependencies:
        if not re.search(
            rf'<(?:depend|build_depend|exec_depend)>\s*'
            rf'{re.escape(dependency)}\s*'
            rf'</(?:depend|build_depend|exec_depend)>',
            text,
        ):
            additions.append(f'  <depend>{dependency}</depend>')
    if not re.search(
        r'<member_of_group>\s*rosidl_interface_packages\s*</member_of_group>',
        text,
    ):
        additions.append('  <member_of_group>rosidl_interface_packages</member_of_group>')
    if not additions:
        return False
    marker = text.find('  <export>')
    if marker < 0:
        marker = text.find('</package>')
    if marker < 0:
        raise InterfaceUploadError('package.xml의 package 닫기 태그를 찾을 수 없습니다.')
    result = text[:marker] + '\n'.join(additions) + '\n\n' + text[marker:]
    _backup(path)
    _atomic_write(path, result)
    return True


def _check_import(package_name: str, kind: str, type_name: str) -> tuple[bool, str | None]:
    module_name = f'{package_name}.{kind}'
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            importlib.invalidate_caches()
            if attempt:
                _purge_interface_modules(package_name)
                importlib.invalidate_caches()
            if module_name in sys.modules:
                module = importlib.reload(sys.modules[module_name])
            else:
                module = importlib.import_module(module_name)
            getattr(module, type_name)
            return True, None
        except (ImportError, AttributeError) as exc:
            last_error = exc
    return False, str(last_error)


def _purge_interface_modules(package_name: str) -> None:
    for module_name in list(sys.modules):
        if module_name == package_name or module_name.startswith(f'{package_name}.'):
            sys.modules.pop(module_name, None)


def _backup(path: Path) -> None:
    backup = path.with_name(f'{path.name}.bak')
    if not backup.exists():
        shutil.copy2(path, backup)


def _atomic_write(path: Path, content: str) -> None:
    temporary_name = ''
    with tempfile.NamedTemporaryFile(
        mode='w', encoding='utf-8', dir=path.parent,
        prefix=f'.{path.name}.', delete=False,
    ) as temporary:
        temporary_name = temporary.name
        temporary.write(content)
    os.replace(temporary_name, path)


def registry_snapshot(registry_path: Path | None = None) -> dict[str, Any]:
    """Return the normalized registry document."""
    path = registry_path or default_registry_path()
    with _REGISTRY_LOCK:
        return _load_registry(path)


def mark_registry_build_applied(
    registry_path: Path | None = None,
) -> dict[str, Any]:
    """Persist that the current registered interface files have been built."""
    path = registry_path or default_registry_path()
    applied_at = datetime.now(timezone.utc).isoformat()
    with _REGISTRY_LOCK:
        registry = _load_registry(path)
        for item in _iter_registry_items(registry):
            build = item.get('build')
            if not isinstance(build, dict) or build.get('error'):
                continue
            build['rebuild_required'] = False
            build['last_build_status'] = 'success'
            build['last_build_at'] = applied_at
        _write_registry(path, registry)
        return registry


def refresh_registry_imports(
    registry_path: Path | None = None,
) -> dict[str, Any]:
    """Re-check generated Python imports for all registered interface types."""
    path = registry_path or default_registry_path()
    checked_at = datetime.now(timezone.utc).isoformat()
    with _REGISTRY_LOCK:
        registry = _load_registry(path)
        for item in _iter_registry_items(registry):
            build = item.get('build')
            if not isinstance(build, dict):
                continue
            package_name = build.get('interface_package')
            kind = item.get('file_kind')
            type_name = item.get('type_name')
            if not package_name or kind not in ALLOWED_KINDS or not type_name:
                continue
            available, error = _check_import(str(package_name), str(kind), str(type_name))
            build['import_available'] = available
            build['import_error'] = error
            build['import_checked_at'] = checked_at
            if available:
                build['rebuild_required'] = False
        summary = _registry_apply_summary(
            registry,
            registry_path=path,
            require_import_available=True,
            update_registry=True,
        )
        _write_registry(path, registry)
        registry['apply_summary'] = summary
        return registry


def registry_apply_summary(
    registry_path: Path | None = None,
    *,
    require_import_available: bool = False,
) -> dict[str, Any]:
    """Return actual disk-backed apply state for the current registry."""
    path = registry_path or default_registry_path()
    with _REGISTRY_LOCK:
        if not path.is_file():
            return _missing_registry_summary(path)
        registry = _load_registry(path)
        summary = _registry_apply_summary(
            registry,
            registry_path=path,
            require_import_available=require_import_available,
            update_registry=True,
        )
        _write_registry(path, registry)
        return summary


def parse_interface(raw_text: str, kind: str) -> dict[str, Any]:
    """Parse the supported top-level sections of a ROS interface file."""
    sections = _split_sections(raw_text)
    expected = {'msg': 1, 'srv': 2, 'action': 3}[kind]
    if len(sections) != expected:
        labels = {'msg': 'fields', 'srv': 'request/response', 'action': 'goal/result/feedback'}
        raise InterfaceUploadError(f'{kind}의 {labels[kind]} 구분 형식이 올바르지 않습니다.')

    parsed_sections = [_parse_fields(lines) for lines in sections]
    if kind == 'msg':
        return {'fields': parsed_sections[0]}
    if kind == 'srv':
        return {'request': parsed_sections[0], 'response': parsed_sections[1]}
    return {
        'goal': parsed_sections[0],
        'result': parsed_sections[1],
        'feedback': parsed_sections[2],
    }


def _split_sections(raw_text: str) -> list[list[str]]:
    sections: list[list[str]] = [[]]
    for source_line in raw_text.splitlines():
        line = source_line.split('#', 1)[0].strip()
        if not line:
            continue
        if line == '---':
            sections.append([])
        else:
            sections[-1].append(line)
    return sections


def _parse_fields(lines: list[str]) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for line in lines:
        parts = line.split(None, 1)
        if len(parts) != 2:
            fields.append({'raw_line': line})
            continue
        field_type, declaration = parts
        item: dict[str, Any] = {'type': field_type, 'raw_line': line}
        if '=' in declaration:
            name, value = declaration.split('=', 1)
            item.update(name=name.strip(), value=value.strip(), is_constant=True)
        else:
            declaration_parts = declaration.split(None, 1)
            item['name'] = declaration_parts[0]
            if len(declaration_parts) > 1:
                item['default'] = declaration_parts[1]
        fields.append(item)
    return fields


def _safe_file_name(file_name: str) -> str:
    normalized = file_name.replace('\\', '/')
    safe_name = PurePath(normalized).name.strip()
    if not safe_name or safe_name in {'.', '..'} or '\x00' in safe_name:
        raise InterfaceUploadError('파일명이 올바르지 않습니다.')
    return safe_name


def _empty_registry() -> dict[str, Any]:
    return {
        'interface_registry': {
            'messages': [],
            'services': [],
            'actions': [],
        },
    }


def _load_registry(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return _empty_registry()
    try:
        data = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise InterfaceUploadError(f'타입 registry를 읽을 수 없습니다: {exc}') from exc

    root = data.get('interface_registry') if isinstance(data, dict) else None
    if not isinstance(root, dict):
        return _empty_registry()
    normalized = _empty_registry()
    for name in KIND_COLLECTIONS.values():
        value = root.get(name)
        normalized['interface_registry'][name] = value if isinstance(value, list) else []
    return normalized


def _iter_registry_items(registry: dict[str, Any]):
    root = registry.get('interface_registry', {})
    for collection_name in KIND_COLLECTIONS.values():
        collection = root.get(collection_name, [])
        if isinstance(collection, list):
            yield from collection


def _registry_apply_summary(
    registry: dict[str, Any],
    *,
    registry_path: Path,
    require_import_available: bool,
    update_registry: bool,
) -> dict[str, Any]:
    package_name, package_path = default_interface_package()
    package_xml = package_path / 'package.xml'
    cmake_path = package_path / 'CMakeLists.txt'
    cmake_text = _read_optional_text(cmake_path)
    package_text = _read_optional_text(package_xml)
    not_applied: list[dict[str, Any]] = []
    import_pending: list[dict[str, Any]] = []
    total = 0

    for item in _iter_registry_items(registry):
        total += 1
        build = item.setdefault('build', {})
        if not isinstance(build, dict):
            build = {}
            item['build'] = build

        kind = str(item.get('file_kind') or '')
        file_name = str(item.get('file_name') or '')
        if item.get('source') == 'manual_type':
            if update_registry:
                package_name = str(build.get('interface_package') or '').strip()
                type_name = str(item.get('type_name') or '').strip()
                if package_name and kind in ALLOWED_KINDS and type_name:
                    available, error = _check_import(package_name, kind, type_name)
                    build['import_available'] = available
                    build['import_error'] = error
                    build['rebuild_required'] = False
            if require_import_available and not build.get('import_available'):
                not_applied.append({
                    'file_name': file_name,
                    'saved_path': None,
                    'reason': build.get('import_error') or 'import_available false',
                })
            continue
        item_package_path = build.get('absolute_interface_package_path') or build.get('interface_package_path')
        active_package_path = Path(str(item_package_path)).resolve() if item_package_path else package_path
        active_package_name = str(build.get('interface_package') or package_name)
        active_package_xml = active_package_path / 'package.xml'
        active_cmake_path = active_package_path / 'CMakeLists.txt'
        active_cmake_text = _read_optional_text(active_cmake_path)
        active_package_text = _read_optional_text(active_package_xml)
        interface_path = f'{kind}/{file_name}' if kind and file_name else ''
        actual_path = _registered_interface_path(active_package_path, build, interface_path)
        file_saved = actual_path.is_file()
        cmake_registered = bool(
            interface_path
            and active_cmake_text
            and (
                interface_path in active_cmake_text
                or f'"{interface_path}"' in active_cmake_text
            )
        )
        package_xml_checked = _package_xml_satisfies(
            active_package_text,
            active_package_name,
            build.get('dependency_candidates', []),
        )

        if update_registry:
            build['interface_package'] = active_package_name
            build['interface_package_path'] = _display_path(active_package_path)
            build['saved_path'] = _display_path(actual_path) if file_saved else build.get('saved_path')
            build['absolute_saved_path'] = str(actual_path) if file_saved else build.get('absolute_saved_path')
            build['file_saved'] = file_saved
            build['cmake_registered'] = cmake_registered
            build['package_xml_checked'] = package_xml_checked

        reasons: list[str] = []
        if build.get('error'):
            reasons.append(str(build['error']))
        if not file_saved:
            reasons.append('file_saved false')
        if not cmake_registered:
            reasons.append('cmake_registered false')
        if not package_xml_checked:
            reasons.append('package_xml_checked false')

        import_available = bool(build.get('import_available'))
        if require_import_available and not import_available:
            reasons.append('import_available false')
        elif not require_import_available and not import_available:
            import_pending.append({
                'file_name': file_name,
                'reason': build.get('import_error') or 'import-check pending after reload',
            })

        if reasons:
            not_applied.append({
                'file_name': file_name,
                'saved_path': build.get('saved_path'),
                'reason': ', '.join(reasons),
            })

    real_apply_success = total > 0 and not not_applied
    ready_for_build = total > 0 and not any(
        item for item in not_applied
        if 'import_available false' not in item['reason']
    )
    status = 'success' if real_apply_success else 'partial'
    if total == 0:
        status = 'empty'
    return {
        'status': status,
        'real_apply_success': real_apply_success,
        'ready_for_build': ready_for_build,
        'registry_exists': registry_path.is_file(),
        'registry_path': _display_path(registry_path),
        'interface_package': package_name,
        'interface_package_path': _display_path(package_path),
        'total': total,
        'applied_count': total - len(not_applied),
        'not_applied': not_applied,
        'import_pending': import_pending,
        'requires_import_available': require_import_available,
    }


def _missing_registry_summary(path: Path) -> dict[str, Any]:
    package_name, package_path = default_interface_package()
    return {
        'status': 'failed',
        'real_apply_success': False,
        'ready_for_build': False,
        'registry_exists': False,
        'registry_path': _display_path(path),
        'interface_package': package_name,
        'interface_package_path': _display_path(package_path),
        'total': 0,
        'applied_count': 0,
        'not_applied': [{
            'file_name': None,
            'saved_path': None,
            'reason': f'interface_registry.yaml 파일이 없습니다: {_display_path(path)}',
        }],
        'import_pending': [],
        'requires_import_available': False,
    }


def _registered_interface_path(
    package_path: Path,
    build: dict[str, Any],
    interface_path: str,
) -> Path:
    saved = build.get('absolute_saved_path') or build.get('saved_path')
    if saved:
        saved_path = Path(str(saved))
        if not saved_path.is_absolute():
            project_root = backend_workspace_root().parent
            if saved_path.parts and saved_path.parts[0] == backend_workspace_root().name:
                saved_path = project_root / saved_path
            else:
                saved_path = backend_workspace_root() / saved_path
        return saved_path
    return package_path / interface_path


def _package_xml_satisfies(
    package_text: str,
    package_name: str,
    dependencies: Any,
) -> bool:
    if not package_text:
        return False
    if not re.search(rf'<name>\s*{re.escape(package_name)}\s*</name>', package_text):
        return False
    if not re.search(
        r'<(?:build_depend|depend)>\s*rosidl_default_generators\s*</(?:build_depend|depend)>',
        package_text,
    ):
        return False
    if not re.search(
        r'<(?:exec_depend|depend)>\s*rosidl_default_runtime\s*</(?:exec_depend|depend)>',
        package_text,
    ):
        return False
    if not re.search(
        r'<member_of_group>\s*rosidl_interface_packages\s*</member_of_group>',
        package_text,
    ):
        return False
    for dependency in dependencies if isinstance(dependencies, list) else []:
        if not re.search(
            rf'<(?:depend|build_depend|exec_depend)>\s*{re.escape(str(dependency))}\s*'
            rf'</(?:depend|build_depend|exec_depend)>',
            package_text,
        ):
            return False
    return True


def _read_optional_text(path: Path) -> str:
    try:
        return path.read_text(encoding='utf-8')
    except (OSError, UnicodeError):
        return ''


def backend_workspace_root() -> Path:
    """Return the backend workspace root used by interface registry paths."""
    return Path(__file__).resolve().parents[3]


def _display_path(path: Path) -> str:
    resolved = path.resolve()
    root = backend_workspace_root().parent
    try:
        return resolved.relative_to(root).as_posix()
    except ValueError:
        return str(resolved)


def _write_registry(path: Path, registry: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_name = ''
    try:
        with tempfile.NamedTemporaryFile(
            mode='w', encoding='utf-8', dir=path.parent,
            prefix=f'.{path.name}.', delete=False,
        ) as temporary:
            temporary_name = temporary.name
            yaml.safe_dump(
                registry, temporary, allow_unicode=True, sort_keys=False,
            )
        os.replace(temporary_name, path)
    except OSError as exc:
        if temporary_name:
            Path(temporary_name).unlink(missing_ok=True)
        raise InterfaceUploadError(f'타입 registry를 저장할 수 없습니다: {exc}') from exc
