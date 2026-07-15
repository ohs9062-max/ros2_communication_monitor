"""Parse and persist uploaded ROS 2 interface definition files."""

from __future__ import annotations

import os
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


class InterfaceUploadError(ValueError):
    """Raised when an uploaded interface file is invalid."""


def default_registry_path() -> Path:
    """Return the registry path without coupling it to monitor.yaml."""
    backend_root = Path(__file__).resolve().parents[3]
    configured = Path(
        os.getenv('INTERFACE_REGISTRY_PATH', 'config/interface_registry.yaml'),
    )
    return configured if configured.is_absolute() else backend_root / configured


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

    entry: dict[str, Any] = {
        'file_name': safe_name,
        'file_kind': kind,
        'type_name': Path(safe_name).stem,
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
        collection[:] = [
            item for item in collection
            if item.get('file_name') != safe_name
        ]
        collection.append(entry)
        _write_registry(path, registry)
    return entry


def registry_snapshot(registry_path: Path | None = None) -> dict[str, Any]:
    """Return the normalized registry document."""
    path = registry_path or default_registry_path()
    with _REGISTRY_LOCK:
        return _load_registry(path)


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
