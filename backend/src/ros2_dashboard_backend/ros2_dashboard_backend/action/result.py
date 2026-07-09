"""Helpers for observed-goal-only action result lookup."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.action.models import (
    GOAL_STATUS_SUCCEEDED,
    RESULT_POLICY_OBSERVED_GOAL_ONLY,
    RESULT_STATUS_SUCCESS,
    RESULT_STATUS_UNAVAILABLE,
    goal_status_label,
)
from ros2_dashboard_backend.action.subscriptions import message_to_preview

from rosidl_runtime_py.utilities import get_action


def load_result_service_class(
    action_type: str | None,
) -> tuple[type | None, str | None, str | None]:
    """Load generated GetResult service class for an action type."""
    if action_type is None:
        return None, None, 'action type is unknown'

    try:
        action_class = get_action(action_type)
    except (AttributeError, ImportError, LookupError, ValueError) as exc:
        return None, None, f'failed to import action type: {exc}'

    service_class = getattr(
        getattr(action_class, 'Impl', None),
        'GetResultService',
        None,
    )
    if service_class is None:
        return None, None, 'action GetResult service class is unavailable'

    return service_class, RESULT_POLICY_OBSERVED_GOAL_ONLY, None


def build_get_result_request(
    service_class: type,
    goal_id_message: Any,
) -> Any:
    """Build a GetResult request for an observed goal_id message."""
    request = service_class.Request()
    request.goal_id.uuid = list(getattr(goal_id_message, 'uuid', []))
    return request


def build_result_state(response: Any) -> dict[str, Any]:
    """Convert GetResult response into runtime result state."""
    status_label = goal_status_label(getattr(response, 'status', None))
    if status_label == GOAL_STATUS_SUCCEEDED:
        result_status = RESULT_STATUS_SUCCESS
    else:
        result_status = status_label

    return {
        'result_status': result_status,
        'result_preview': message_to_preview(
            getattr(response, 'result', None),
        ),
        'result_error': None,
    }


def build_result_error_state(message: str) -> dict[str, Any]:
    """Return a result unavailable runtime state."""
    return {
        'result_status': RESULT_STATUS_UNAVAILABLE,
        'result_preview': None,
        'result_error': message,
    }
