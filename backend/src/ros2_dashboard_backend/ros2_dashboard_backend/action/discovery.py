"""Helpers for building ROS graph action items."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.action.models import (
    action_status,
    default_runtime,
)


def action_status_topic(name: str) -> str:
    """Return the internal status topic name for an action."""
    return f'{name}/_action/status'


def action_feedback_topic(name: str) -> str:
    """Return the internal feedback topic name for an action."""
    return f'{name}/_action/feedback'


def build_action_item(
    *,
    name: str,
    action_type: str | None,
    server_count: int,
    client_count: int,
    updated_at: float,
    status_supported: bool,
    feedback_supported: bool,
    feedback_reason: str | None,
    result_supported: bool,
    result_policy: str | None,
    result_reason: str | None,
    runtime: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build a public /ros/actions item."""
    status, reason = action_status(
        action_type,
        server_count,
        client_count,
    )
    runtime_state = default_runtime()
    if runtime is not None:
        runtime_state.update(runtime)

    return {
        'name': name,
        'type': action_type,
        'server_count': server_count,
        'client_count': client_count,
        'status': status,
        'reason': reason,
        'last_updated': updated_at,
        'status_topic': action_status_topic(name),
        'feedback_topic': action_feedback_topic(name),
        'status_supported': status_supported,
        'feedback_supported': feedback_supported,
        'feedback_reason': feedback_reason,
        'result_supported': result_supported,
        'result_policy': result_policy,
        'result_reason': result_reason,
        'runtime': runtime_state,
    }
