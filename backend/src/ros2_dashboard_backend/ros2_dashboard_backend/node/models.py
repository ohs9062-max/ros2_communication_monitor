"""Node 모니터링의 models 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any


NODE_STATUS_ACTIVE = 'active'
NODE_STATUS_STALE = 'stale'
NODE_STATUS_DISCONNECTED = 'disconnected'
NODE_STATUS_INACTIVE = 'inactive'
NODE_STATUS_UNKNOWN = 'unknown'

ALERT_LEVEL_WARNING = 'warning'
ALERT_CODE_NODE_STALE = 'node_stale'


def full_node_name(name: str, namespace: str) -> str:
    """Node 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    normalized_namespace = namespace or '/'
    if normalized_namespace == '/':
        return f'/{name.lstrip("/")}'

    return f'{normalized_namespace.rstrip("/")}/{name.lstrip("/")}'


def node_status(
    *,
    discovered: bool,
    stale: bool = False,
) -> tuple[str, str]:
    """Node 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    if discovered:
        return NODE_STATUS_ACTIVE, 'node discovered in ROS2 graph'

    if stale:
        return NODE_STATUS_STALE, 'node is no longer visible in ROS2 graph'

    return NODE_STATUS_INACTIVE, 'node is inactive'


def graph_entities(
    names_and_types: list[tuple[str, list[str]]],
) -> list[dict[str, Any]]:
    """Node 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    return [
        {
            'name': name,
            'type': types[0] if types else None,
            'types': list(types),
        }
        for name, types in names_and_types
    ]


def node_meta(
    *,
    nodes: list[dict[str, Any]],
    last_updated: float,
) -> dict[str, int | float]:
    """Node 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    return {
        'count': len(nodes),
        'active_count': _status_count(nodes, NODE_STATUS_ACTIVE),
        'warning_count': _status_count(nodes, NODE_STATUS_STALE),
        'error_count': (
            _status_count(nodes, NODE_STATUS_DISCONNECTED)
        ),
        'publisher_count': sum(
            node.get('publisher_count', 0) for node in nodes
        ),
        'subscriber_count': sum(
            node.get('subscriber_count', 0) for node in nodes
        ),
        'service_server_count': sum(
            node.get('service_server_count', 0) for node in nodes
        ),
        'service_client_count': sum(
            node.get('service_client_count', 0) for node in nodes
        ),
        'action_server_count': sum(
            node.get('action_server_count', 0) for node in nodes
        ),
        'action_client_count': sum(
            node.get('action_client_count', 0) for node in nodes
        ),
        'last_updated': last_updated,
    }


def _status_count(nodes: list[dict[str, Any]], status: str) -> int:
    return sum(1 for node in nodes if node.get('status') == status)
