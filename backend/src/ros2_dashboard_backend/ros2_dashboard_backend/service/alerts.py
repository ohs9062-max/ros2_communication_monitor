"""Service 모니터링의 alerts 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.service.models import SERVICE_CATEGORY_USER


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

    return alerts
