"""Helpers for building ROS graph topic items."""

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
    deep_monitoring: bool,
) -> dict[str, Any]:
    """Build the public /ros/topics item without changing its keys."""
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
        'deep_monitoring': deep_monitoring,
    }
