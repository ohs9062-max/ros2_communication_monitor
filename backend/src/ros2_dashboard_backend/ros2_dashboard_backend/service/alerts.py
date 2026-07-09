"""Alert builders for service monitoring."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.service.active_check import (
    ACTIVE_CHECK_STATUS_ERROR,
    ACTIVE_CHECK_STATUS_FAILED,
    ACTIVE_CHECK_STATUS_TIMEOUT,
    ACTIVE_CHECK_STATUS_TYPE_MISMATCH,
    ACTIVE_CHECK_STATUS_WAITING_SERVER,
    ALERT_CODE_ACTIVE_CHECK_ERROR,
    ALERT_CODE_ACTIVE_CHECK_FAILED,
    ALERT_CODE_ACTIVE_CHECK_TIMEOUT,
    ALERT_CODE_ACTIVE_CHECK_TYPE_MISMATCH,
    ALERT_CODE_ACTIVE_CHECK_WAITING_SERVER,
)
from ros2_dashboard_backend.service.models import (
    ALERT_CODE_SERVICE_WAITING_SERVER,
    ALERT_LEVEL_WARNING,
    SERVICE_CATEGORY_USER,
    SERVICE_STATUS_WAITING_SERVER,
)


ACTIVE_CHECK_ALERTS = {
    ACTIVE_CHECK_STATUS_WAITING_SERVER: (
        'warning',
        ALERT_CODE_ACTIVE_CHECK_WAITING_SERVER,
        'Active check target has no service server.',
    ),
    ACTIVE_CHECK_STATUS_TIMEOUT: (
        'warning',
        ALERT_CODE_ACTIVE_CHECK_TIMEOUT,
        'Service active check timed out.',
    ),
    ACTIVE_CHECK_STATUS_ERROR: (
        'error',
        ALERT_CODE_ACTIVE_CHECK_ERROR,
        'Service active check failed with an error.',
    ),
    ACTIVE_CHECK_STATUS_FAILED: (
        'error',
        ALERT_CODE_ACTIVE_CHECK_FAILED,
        'Service active check response reported failure.',
    ),
    ACTIVE_CHECK_STATUS_TYPE_MISMATCH: (
        'warning',
        ALERT_CODE_ACTIVE_CHECK_TYPE_MISMATCH,
        'Service active check type does not match graph type.',
    ),
}


def build_service_alerts(
    *,
    services: list[dict[str, Any]],
    detected_at: float,
) -> list[dict[str, Any]]:
    """Build alerts for services with clients but no server."""
    alerts = []
    for service in services:
        if service.get('category') != SERVICE_CATEGORY_USER:
            continue

        if service.get('hidden_by_default') is True:
            continue

        if service.get('status') == SERVICE_STATUS_WAITING_SERVER:
            alerts.append(
                _build_waiting_server_alert(
                    service=service,
                    detected_at=detected_at,
                ),
            )

        active_check_alert = _build_active_check_alert(
            service=service,
            detected_at=detected_at,
        )
        if active_check_alert is not None:
            alerts.append(active_check_alert)

    return alerts


def _build_waiting_server_alert(
    *,
    service: dict[str, Any],
    detected_at: float,
) -> dict[str, Any]:
    name = service['name']
    return {
        'id': f'service:{name}:{ALERT_CODE_SERVICE_WAITING_SERVER}',
        'level': ALERT_LEVEL_WARNING,
        'source': 'service',
        'name': name,
        'code': ALERT_CODE_SERVICE_WAITING_SERVER,
        'message': (
            'Service client exists but no server is available.'
        ),
        'status': SERVICE_STATUS_WAITING_SERVER,
        'last_received_at': None,
        'age_sec': None,
        'detected_at': detected_at,
    }


def _build_active_check_alert(
    *,
    service: dict[str, Any],
    detected_at: float,
) -> dict[str, Any] | None:
    if service.get('active_check_supported') is not True:
        return None

    active_check = service.get('active_check', {})
    status = active_check.get('last_status')
    alert_config = ACTIVE_CHECK_ALERTS.get(status)
    if alert_config is None:
        return None

    level, code, message = alert_config
    name = service['name']
    return {
        'id': f'service:{name}:{code}',
        'level': level,
        'source': 'service',
        'name': name,
        'code': code,
        'message': message,
        'status': status,
        'last_received_at': active_check.get('last_checked_at'),
        'age_sec': None,
        'detected_at': detected_at,
    }
