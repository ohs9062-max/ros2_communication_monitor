"""Interface Lab의 value_converter 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

import math
import re
from typing import Any

from rosidl_runtime_py.utilities import get_message


class InterfaceValidationError(ValueError):
    """Interface Lab에서 발생하는 예외를 표현하는 클래스입니다."""

    def __init__(self, message: str, details: list[str] | None = None) -> None:
        super().__init__(message)
        self.details = details or [message]


_INT_RANGES = {
    'byte': (-128, 127),
    'char': (0, 255),
    'int8': (-128, 127),
    'uint8': (0, 255),
    'int16': (-32768, 32767),
    'uint16': (0, 65535),
    'int32': (-2147483648, 2147483647),
    'uint32': (0, 4294967295),
    'int64': (-9223372036854775808, 9223372036854775807),
    'uint64': (0, 18446744073709551615),
}
_FLOAT_TYPES = {'float', 'float32', 'double', 'float64'}
_STRING_TYPES = {'string', 'wstring'}
_BOOL_TYPES = {'bool', 'boolean'}


def build_ros_message(message_class: type, payload: dict[str, Any], *, label: str = 'payload') -> Any:
    """Interface Lab에서 public API 응답 항목을 조립하는 함수입니다."""
    if not isinstance(payload, dict):
        raise InterfaceValidationError(f'{label} must be an object')
    target = message_class()
    fill_ros_message(target, payload, label=label)
    return target


def fill_ros_message(target: Any, payload: dict[str, Any], *, label: str) -> None:
    """Interface Lab에서 요청된 처리를 수행하는 함수입니다."""
    fields = target.get_fields_and_field_types()
    unknown = sorted(set(payload) - set(fields))
    if unknown:
        field = unknown[0]
        raise InterfaceValidationError(
            f"Unknown field '{field}' for {_message_type_name(target)}",
            [f'{label}.{field}: unknown field'],
        )

    for field_name, field_type in fields.items():
        if field_name not in payload:
            continue
        value = convert_value(payload[field_name], field_type, label=f'{label}.{field_name}')
        setattr(target, field_name, value)


def convert_value(value: Any, field_type: str, *, label: str) -> Any:
    """Interface Lab에서 값을 JSON-safe 또는 ROS2 객체 형태로 변환하는 함수입니다."""
    normalized = _normalize_type(field_type)
    sequence_type = _sequence_item_type(normalized)
    if sequence_type is not None:
        if not isinstance(value, list):
            raise InterfaceValidationError(
                f'{label} must be a list for {field_type}',
                [f'{label}: expected list'],
            )
        return [
            convert_value(item, sequence_type, label=f'{label}[{index}]')
            for index, item in enumerate(value)
        ]

    if _is_array_type(normalized):
        item_type = normalized.split('[', 1)[0]
        if not isinstance(value, list):
            raise InterfaceValidationError(
                f'{label} must be a list for {field_type}',
                [f'{label}: expected list'],
            )
        return [
            convert_value(item, item_type, label=f'{label}[{index}]')
            for index, item in enumerate(value)
        ]

    if normalized in _BOOL_TYPES:
        return _convert_bool(value, label)
    if normalized in _INT_RANGES:
        return _convert_int(value, normalized, label)
    if normalized in _FLOAT_TYPES:
        return _convert_float(value, label)
    if normalized in _STRING_TYPES:
        if not isinstance(value, str):
            raise InterfaceValidationError(
                f'{label} must be a string',
                [f'{label}: expected string'],
            )
        return value

    return _convert_custom_message(value, normalized, label)


def ros_value_to_json(value: Any) -> Any:
    """Interface Lab에서 요청된 처리를 수행하는 함수입니다."""
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [ros_value_to_json(item) for item in value]
    if hasattr(value, 'get_fields_and_field_types'):
        return {
            key: ros_value_to_json(getattr(value, key))
            for key in value.get_fields_and_field_types()
        }
    return str(value)


def ros_message_to_json(message: Any) -> dict[str, Any]:
    """Interface Lab에서 요청된 처리를 수행하는 함수입니다."""
    return {
        key: ros_value_to_json(getattr(message, key))
        for key in message.get_fields_and_field_types()
    }


def schema_from_message_class(message_class: type) -> list[dict[str, str]]:
    """Interface Lab에서 interface schema를 반환하는 함수입니다."""
    try:
        message = message_class()
        fields = message.get_fields_and_field_types()
    except Exception:
        return []
    return [
        {'name': name, 'type': field_type, 'raw_line': f'{field_type} {name}'}
        for name, field_type in fields.items()
    ]


def schema_from_message_type(message_type: str) -> list[dict[str, str]]:
    """Interface Lab에서 interface schema를 반환하는 함수입니다."""
    try:
        message_class = get_message(message_type)
    except Exception:
        return []
    return schema_from_message_class(message_class)


def _convert_custom_message(value: Any, field_type: str, label: str) -> Any:
    if not isinstance(value, dict):
        raise InterfaceValidationError(
            f'{label} must be an object for {field_type}',
            [f'{label}: expected object'],
        )
    message_class = _load_message_class(field_type)
    message = message_class()
    fill_ros_message(message, value, label=label)
    return message


def _load_message_class(field_type: str) -> type:
    message_type = _message_type_string(field_type)
    try:
        return get_message(message_type)
    except (AttributeError, ModuleNotFoundError, ValueError) as exc:
        raise InterfaceValidationError(
            f'Cannot import custom message type {message_type}',
            [f'{message_type}: {exc}'],
        ) from exc


def _message_type_string(field_type: str) -> str:
    parts = field_type.split('/')
    if len(parts) == 2:
        return f'{parts[0]}/msg/{parts[1]}'
    if len(parts) == 3 and parts[1] == 'msg':
        return field_type
    raise InterfaceValidationError(
        f'Unsupported field type {field_type}',
        [f'{field_type}: unsupported type'],
    )


def _convert_bool(value: Any, label: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {'true', '1', 'yes', 'y', 'on'}:
            return True
        if lowered in {'false', '0', 'no', 'n', 'off'}:
            return False
    raise InterfaceValidationError(
        f'{label} must be a boolean',
        [f'{label}: expected boolean'],
    )


def _convert_int(value: Any, type_name: str, label: str) -> int:
    if isinstance(value, bool):
        raise InterfaceValidationError(f'{label} must be {type_name}', [f'{label}: expected integer'])
    try:
        converted = int(value)
    except (TypeError, ValueError) as exc:
        raise InterfaceValidationError(f'{label} must be {type_name}', [f'{label}: expected integer']) from exc
    if isinstance(value, float) and not value.is_integer():
        raise InterfaceValidationError(f'{label} must be {type_name}', [f'{label}: expected integer'])
    minimum, maximum = _INT_RANGES[type_name]
    if converted < minimum or converted > maximum:
        raise InterfaceValidationError(
            f'{label} out of range for {type_name}',
            [f'{label}: expected {minimum}..{maximum}'],
        )
    return converted


def _convert_float(value: Any, label: str) -> float:
    if isinstance(value, bool):
        raise InterfaceValidationError(f'{label} must be a number', [f'{label}: expected number'])
    try:
        converted = float(value)
    except (TypeError, ValueError) as exc:
        raise InterfaceValidationError(f'{label} must be a number', [f'{label}: expected number']) from exc
    if not math.isfinite(converted):
        raise InterfaceValidationError(f'{label} must be finite', [f'{label}: expected finite number'])
    return converted


def _normalize_type(field_type: str) -> str:
    return re.sub(r'\s+', '', field_type)


def _sequence_item_type(field_type: str) -> str | None:
    match = re.fullmatch(r'sequence<(.+?)(?:,\d+)?>', field_type)
    return match.group(1) if match else None


def _is_array_type(field_type: str) -> bool:
    return bool(re.fullmatch(r'.+\[[0-9]*\]', field_type))


def _message_type_name(message: Any) -> str:
    module = message.__class__.__module__.replace('.', '/')
    return f'{module}/{message.__class__.__name__}'
