"""Node 모니터링의 alerts 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.node.models import (
    ALERT_CODE_NODE_STALE,
    NODE_STATUS_DISCONNECTED,
)


def build_node_alerts(
    *,
    nodes: list[dict[str, Any]],
    detected_at: float,
) -> list[dict[str, Any]]:
    """Node 모니터링에서 Alert 항목을 조립하는 함수입니다."""
    alerts = []
    for node in nodes:
        if node.get('status') != NODE_STATUS_DISCONNECTED:
            continue

        name = node.get('full_name') or node.get('name')
        alerts.append(
            {
                'id': f'node:{name}:{ALERT_CODE_NODE_STALE}',
                'level': 'error',
                'source': 'node',
                'name': name,
                'code': ALERT_CODE_NODE_STALE,
                'message': (
                    'Node connection lost; it is no longer visible '
                    'in the ROS2 graph.'
                ),
                'status': NODE_STATUS_DISCONNECTED,
                'last_received_at': node.get('last_seen_at'),
                'age_sec': None,
                'detected_at': detected_at,
            },
        )

    return alerts
