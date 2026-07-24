"""Service 모니터링의 alerts 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.service.active_check import (
    ACTIVE_CHECK_STATUS_ERROR,
    ACTIVE_CHECK_STATUS_FAILED,
    ACTIVE_CHECK_STATUS_TIMEOUT,
    ALERT_CODE_ACTIVE_CHECK_ERROR,
    ALERT_CODE_ACTIVE_CHECK_FAILED,
    ALERT_CODE_ACTIVE_CHECK_TIMEOUT,
)
from ros2_dashboard_backend.service.models import SERVICE_CATEGORY_USER


ACTIVE_CHECK_ALERTS = {
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
}


def build_service_alerts(
    *,
    services: list[dict[str, Any]],
    detected_at: float,
) -> list[dict[str, Any]]:
    """Service 모니터링에서 Service 실행 또는 상태를 처리하는 함수입니다."""
    alerts = []
    for service in services:
        if service.get('category') != SERVICE_CATEGORY_USER:
            continue

        if service.get('hidden_by_default') is True:
            continue

        if (
            service.get('status') == 'disconnected'
            and service.get('allowlisted') is True
        ):
            alerts.append({
                'id': f'service:{service["name"]}:service_disconnected',
                'level': 'error',
                'source': 'service',
                'name': service['name'],
                'code': 'service_disconnected',
                'message': (
                    'Service connection lost; it is no longer visible '
                    'in the ROS2 graph.'
                ),
                'status': 'disconnected',
                'last_received_at': service.get('last_seen_at'),
                'age_sec': None,
                'detected_at': detected_at,
            })
            continue

        active_check_alert = _build_active_check_alert(
            service=service,
            detected_at=detected_at,
        )
        if active_check_alert is not None:
            alerts.append(active_check_alert)

    return alerts


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
