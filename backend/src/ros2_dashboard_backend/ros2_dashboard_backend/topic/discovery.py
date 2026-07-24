"""Topic 모니터링의 discovery 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.topic.models import topic_status


def build_topic_item(
    *,
    name: str,
    types: list[str],
    publisher_count: int,
    raw_subscriber_count: int,
    monitor_subscriber_count: int,
    external_subscriber_count: int,
    updated_at: float,
    supported_type: bool,
    registered_interface_type: bool,
    deep_monitoring: bool,
) -> dict[str, Any]:
    """Topic 모니터링에서 public API 응답 항목을 조립하는 함수입니다."""
    status, reason = topic_status(
        publisher_count,
        external_subscriber_count,
    )

    return {
        'name': name,
        'types': types,
        'publisher_count': publisher_count,
        'subscriber_count': raw_subscriber_count,
        'raw_subscriber_count': raw_subscriber_count,
        'monitor_subscriber_count': monitor_subscriber_count,
        'external_subscriber_count': external_subscriber_count,
        'status': status,
        'reason': reason,
        'last_updated': updated_at,
        'supported_type': supported_type,
        'registered_interface_type': registered_interface_type,
        'deep_monitoring': deep_monitoring,
    }
