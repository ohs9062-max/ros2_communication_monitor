"""Action 모니터링의 discovery 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.action.models import (
    action_status,
    default_runtime,
)


def action_status_topic(name: str) -> str:
    """Action 모니터링에서 Action 실행 또는 상태를 처리하는 함수입니다."""
    return f'{name}/_action/status'


def action_feedback_topic(name: str) -> str:
    """Action 모니터링에서 Action 실행 또는 상태를 처리하는 함수입니다."""
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
    """Action 모니터링에서 Action 실행 또는 상태를 처리하는 함수입니다."""
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
