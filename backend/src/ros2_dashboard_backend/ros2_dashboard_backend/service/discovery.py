"""Helpers for building ROS graph service items."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.service.active_check import (
    build_active_check_state,
)
from ros2_dashboard_backend.service.filters import (
    is_hidden_by_default,
    service_category,
)
from ros2_dashboard_backend.service.models import service_status


def build_service_item(
    *,
    name: str,
    service_type: str | None,
    server_count: int,
    client_count: int | None,
    supported_type: bool,
    updated_at: float,
    active_check_config: Any,
    active_check_allowlist: dict[str, Any],
    active_check_cache: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Build a public /ros/services item."""
    category = service_category(name, service_type)
    status, reason = service_status(
        service_type,
        server_count,
        client_count,
    )
    service = {
        'name': name,
        'type': service_type,
        'server_count': server_count,
        'client_count': client_count,
        'category': category,
        'hidden_by_default': is_hidden_by_default(category),
        'status': status,
        'reason': reason,
        'supported_type': supported_type,
        'last_updated': updated_at,
    }
    active_check_supported, active_check = build_active_check_state(
        service=service,
        active_check_config=active_check_config,
        allowlist_item=active_check_allowlist.get(name),
        cache_entry=active_check_cache.get(name),
    )
    service['active_check_supported'] = active_check_supported
    service['active_check'] = active_check

    return service
