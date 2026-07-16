"""Allowlisted service active check helpers."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.service.models import SERVICE_CATEGORY_USER

from rosidl_runtime_py.utilities import get_service

from ros2_dashboard_backend.interface_value_converter import (
    build_ros_message,
    ros_message_to_json,
)


ACTIVE_CHECK_STATUS_NOT_SUPPORTED = 'not_supported'
ACTIVE_CHECK_STATUS_DISABLED = 'disabled'
ACTIVE_CHECK_STATUS_TYPE_MISMATCH = 'type_mismatch'
ACTIVE_CHECK_STATUS_WAITING_SERVER = 'waiting_server'
ACTIVE_CHECK_STATUS_PENDING = 'pending'
ACTIVE_CHECK_STATUS_SUCCESS = 'success'
ACTIVE_CHECK_STATUS_FAILED = 'failed'
ACTIVE_CHECK_STATUS_TIMEOUT = 'timeout'
ACTIVE_CHECK_STATUS_ERROR = 'error'

ALERT_CODE_ACTIVE_CHECK_WAITING_SERVER = (
    'service_active_check_waiting_server'
)
ALERT_CODE_ACTIVE_CHECK_TIMEOUT = 'service_active_check_timeout'
ALERT_CODE_ACTIVE_CHECK_ERROR = 'service_active_check_error'
ALERT_CODE_ACTIVE_CHECK_FAILED = 'service_active_check_failed'
ALERT_CODE_ACTIVE_CHECK_TYPE_MISMATCH = (
    'service_active_check_type_mismatch'
)


def allowlist_map(active_check_config: Any) -> dict[str, Any]:
    """Return active check allowlist entries keyed by service name."""
    return {
        item.name: item
        for item in active_check_config.allowlist
    }


def active_check_supported(
    *,
    service: dict[str, Any],
    allowlisted: bool,
) -> bool:
    """Return whether active_check may run for the service."""
    return (
        allowlisted
        and service.get('category') == SERVICE_CATEGORY_USER
        and service.get('hidden_by_default') is not True
    )


def build_active_check_state(
    *,
    service: dict[str, Any],
    active_check_config: Any,
    allowlist_item: Any | None,
    cache_entry: dict[str, Any] | None,
) -> tuple[bool, dict[str, Any]]:
    """Build public active_check fields for a service item."""
    supported = active_check_supported(
        service=service,
        allowlisted=allowlist_item is not None,
    )
    if allowlist_item is None:
        return False, _state(
            enabled=False,
            last_status=ACTIVE_CHECK_STATUS_NOT_SUPPORTED,
            reason='not allowlisted',
        )

    if not supported:
        return False, _state(
            enabled=False,
            last_status=ACTIVE_CHECK_STATUS_NOT_SUPPORTED,
            reason='hidden service is not eligible',
            timeout_sec=allowlist_item.timeout_sec,
        )

    if not active_check_config.enabled:
        return True, _state(
            enabled=False,
            last_status=ACTIVE_CHECK_STATUS_DISABLED,
            reason='active check disabled',
            timeout_sec=allowlist_item.timeout_sec,
        )

    if allowlist_item.service_type != service.get('type'):
        return True, _state(
            enabled=True,
            last_status=ACTIVE_CHECK_STATUS_TYPE_MISMATCH,
            reason='allowlist type does not match graph type',
            timeout_sec=allowlist_item.timeout_sec,
            error_message='type mismatch',
        )

    if service.get('server_count', 0) <= 0:
        return True, _state(
            enabled=True,
            last_status=ACTIVE_CHECK_STATUS_WAITING_SERVER,
            reason='service server is not available',
            timeout_sec=allowlist_item.timeout_sec,
        )

    if cache_entry is None:
        return True, _state(
            enabled=True,
            last_status=ACTIVE_CHECK_STATUS_PENDING,
            reason='waiting for first active check',
            timeout_sec=allowlist_item.timeout_sec,
        )

    return True, cache_entry.copy()


def pending_state(
    *,
    started_at: float,
    timeout_sec: float,
) -> dict[str, Any]:
    """Build active_check pending state."""
    return _state(
        enabled=True,
        last_status=ACTIVE_CHECK_STATUS_PENDING,
        last_checked_at=started_at,
        timeout_sec=timeout_sec,
    )


def timeout_state(
    *,
    started_at: float,
    timeout_sec: float,
) -> dict[str, Any]:
    """Build active_check timeout state."""
    return _state(
        enabled=True,
        last_status=ACTIVE_CHECK_STATUS_TIMEOUT,
        last_response_time_ms=timeout_sec * 1000.0,
        last_checked_at=started_at,
        timeout_sec=timeout_sec,
        error_message='timeout',
    )


def error_state(
    *,
    message: str,
    checked_at: float,
    timeout_sec: float,
    response_time_ms: float | None = None,
) -> dict[str, Any]:
    """Build active_check error state."""
    return _state(
        enabled=True,
        last_status=ACTIVE_CHECK_STATUS_ERROR,
        last_response_time_ms=response_time_ms,
        last_checked_at=checked_at,
        timeout_sec=timeout_sec,
        error_message=message,
    )


def response_state(
    *,
    response: Any,
    success_field: str | None,
    checked_at: float,
    timeout_sec: float,
    response_time_ms: float,
) -> dict[str, Any]:
    """Build active_check state from a service response."""
    response_preview = response_to_preview(response)
    try:
        success = response_success(response_preview, success_field)
    except KeyError as exc:
        return error_state(
            message=str(exc),
            checked_at=checked_at,
            timeout_sec=timeout_sec,
            response_time_ms=response_time_ms,
        )

    status = (
        ACTIVE_CHECK_STATUS_SUCCESS
        if success else ACTIVE_CHECK_STATUS_FAILED
    )
    error_message = None if success else 'success_field is false'
    return _state(
        enabled=True,
        last_status=status,
        last_response_time_ms=response_time_ms,
        last_checked_at=checked_at,
        timeout_sec=timeout_sec,
        error_message=error_message,
        response_preview=response_preview,
    )


def load_service_class(service_type: str) -> type:
    """Load a ROS 2 service class by type string."""
    return get_service(service_type)


def build_request(service_class: type, request_data: dict[str, Any]) -> Any:
    """Create a Request object and apply configured fields."""
    return build_ros_message(service_class.Request, request_data, label='request')


def response_to_preview(response: Any) -> dict[str, Any]:
    """Return a JSON-safe response preview."""
    return ros_message_to_json(response)


def response_success(
    response_preview: dict[str, Any],
    success_field: str | None,
) -> bool:
    """Return whether a response counts as success."""
    if success_field is None:
        return True

    value = _lookup_field(response_preview, success_field)
    if isinstance(value, bool):
        return value

    return bool(value)


def _state(
    *,
    enabled: bool,
    last_status: str,
    reason: str | None = None,
    last_response_time_ms: float | None = None,
    last_checked_at: float | None = None,
    timeout_sec: float | None = None,
    error_message: str | None = None,
    response_preview: dict[str, Any] | None = None,
) -> dict[str, Any]:
    state = {
        'enabled': enabled,
        'last_status': last_status,
        'last_response_time_ms': last_response_time_ms,
        'last_checked_at': last_checked_at,
        'timeout_sec': timeout_sec,
        'error_message': error_message,
        'response_preview': response_preview,
    }
    if reason is not None:
        state['reason'] = reason

    return state


def _set_field(target: Any, key: str, value: Any) -> None:
    if not hasattr(target, key):
        raise ValueError(f'unknown request field: {key}')

    current = getattr(target, key)
    if isinstance(value, dict):
        for nested_key, nested_value in value.items():
            _set_field(current, nested_key, nested_value)
        return

    setattr(target, key, value)


def _json_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value

    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]

    if hasattr(value, 'get_fields_and_field_types'):
        return {
            key: _json_value(getattr(value, key))
            for key in value.get_fields_and_field_types()
        }

    return str(value)


def _lookup_field(data: dict[str, Any], field_path: str) -> Any:
    current: Any = data
    for part in field_path.split('.'):
        if not isinstance(current, dict) or part not in current:
            raise KeyError(f'success_field not found: {field_path}')
        current = current[part]

    return current
