"""Helpers for ROS 2 service introspection event topics."""

from __future__ import annotations

from typing import Any

from rosidl_runtime_py.utilities import get_service


SERVICE_EVENT_SUFFIX = '/_service_event'


def service_event_topic_name(service_name: str) -> str:
    """Return the hidden service event topic name for a service."""
    return f'{service_name.rstrip("/")}{SERVICE_EVENT_SUFFIX}'


def service_event_class(service_type: str) -> type:
    """Return the generated Event message class for a service type."""
    return get_service(service_type).Event


def build_service_event_subscription_spec(
    *,
    service_name: str,
    service_type: str,
) -> dict[str, Any]:
    """Build minimal data needed to subscribe to a service event topic."""
    return {
        'topic_name': service_event_topic_name(service_name),
        'event_class': service_event_class(service_type),
    }
