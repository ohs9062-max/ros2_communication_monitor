"""ROS2 Graph 리소스의 공통 발견/연결 끊김 상태 helper입니다."""

from __future__ import annotations

from typing import Any, Iterable


RESOURCE_STATUS_DISCONNECTED = 'disconnected'


def mark_graph_present(
    item: dict[str, Any],
    *,
    observed_at: float,
) -> dict[str, Any]:
    """현재 Graph에 존재하는 리소스의 공통 발견 정보를 기록합니다."""
    item['graph_present'] = True
    item['ever_discovered'] = True
    item['last_seen_at'] = observed_at
    item['disconnected_at'] = None
    return item


def disconnected_resource(
    cached: dict[str, Any],
    *,
    detected_at: float,
    count_fields: Iterable[str] = (),
) -> dict[str, Any]:
    """이전에 발견됐지만 현재 Graph에서 사라진 리소스를 조립합니다."""
    item = cached.copy()
    item['status'] = RESOURCE_STATUS_DISCONNECTED
    item['reason'] = (
        'previously discovered resource is no longer visible in ROS2 graph'
    )
    item['graph_present'] = False
    item['ever_discovered'] = True
    item['disconnected_at'] = (
        cached.get('disconnected_at') or detected_at
    )
    item['last_updated'] = detected_at
    for field in count_fields:
        item[field] = 0
    return item
