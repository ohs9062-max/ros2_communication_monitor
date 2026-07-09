"""Action status and feedback subscription helpers."""

from __future__ import annotations

from importlib import import_module
from typing import Any

from ros2_dashboard_backend.action.models import (
    GOAL_STATUS_ACCEPTED,
    GOAL_STATUS_EXECUTING,
    TERMINAL_GOAL_STATUSES,
    default_runtime,
    goal_id_to_hex,
    goal_status_label,
)

from rosidl_runtime_py.utilities import get_action


STATUS_TOPIC_TYPE = 'action_msgs/msg/GoalStatusArray'


def action_feedback_topic_type(action_type: str | None) -> str | None:
    """Return the generated feedback topic message type for an action type."""
    if action_type is None:
        return None

    parts = action_type.split('/')
    if len(parts) != 3 or parts[1] != 'action':
        return None

    return f'{parts[0]}/action/{parts[2]}_FeedbackMessage'


def load_status_message_class() -> type | None:
    """Load action_msgs/msg/GoalStatusArray."""
    try:
        module = import_module('action_msgs.msg')
    except ImportError:
        return None

    return getattr(module, 'GoalStatusArray', None)


def load_feedback_message_class(action_type: str | None) -> type | None:
    """Load the generated action feedback message class."""
    if action_type is None:
        return None

    parts = action_type.split('/')
    if len(parts) != 3 or parts[1] != 'action':
        return None

    class_name = f'{parts[2]}_FeedbackMessage'
    try:
        module = import_module(f'{parts[0]}.action')
    except ImportError:
        module = None

    if module is not None:
        message_class = getattr(module, class_name, None)
        if message_class is not None:
            return message_class

    try:
        action_class = get_action(action_type)
    except (AttributeError, ImportError, LookupError, ValueError):
        return None

    return getattr(
        getattr(action_class, 'Impl', None),
        'FeedbackMessage',
        None,
    )


def build_action_subscription_entry(
    *,
    action_type: str | None,
    status_subscription: Any = None,
    feedback_subscription: Any = None,
    status_supported: bool = False,
    feedback_supported: bool = False,
) -> dict[str, Any]:
    """Create an action subscription cache entry."""
    return {
        'type': action_type,
        'status_subscription': status_subscription,
        'feedback_subscription': feedback_subscription,
        'status_supported': status_supported,
        'feedback_supported': feedback_supported,
        'feedback_reason': None,
        'result_supported': False,
        'result_policy': None,
        'result_reason': None,
        'goals': {},
        'runtime': default_runtime(),
    }


def action_entry_matches(
    entry: dict[str, Any] | None,
    *,
    action_type: str | None,
) -> bool:
    """Return whether a cache entry matches an action type."""
    return entry is not None and entry.get('type') == action_type


def runtime_snapshot(entry: dict[str, Any] | None) -> dict[str, Any]:
    """Return a shallow copy of cached runtime state."""
    if entry is None:
        return default_runtime()

    runtime = default_runtime()
    cached = entry.get('runtime')
    if isinstance(cached, dict):
        runtime.update(cached)
    return runtime


def update_status_runtime(
    entry: dict[str, Any],
    *,
    message: Any,
    received_at: float,
) -> None:
    """Update runtime state from action_msgs/msg/GoalStatusArray."""
    status_list = list(getattr(message, 'status_list', []) or [])
    if not status_list:
        return

    latest_goal_id = None
    latest_status = None
    for status_item in status_list:
        goal_info = getattr(status_item, 'goal_info', None)
        goal_id = getattr(goal_info, 'goal_id', None)
        goal_key = goal_id_to_hex(goal_id)
        if goal_key is None:
            continue

        status_label = goal_status_label(getattr(status_item, 'status', None))
        goal = _goal_state(entry, goal_key, goal_id)
        _update_goal_status(goal, status_label, received_at)
        latest_goal_id = goal_key
        latest_status = status_label

    if latest_goal_id is None:
        return

    goals = entry.get('goals', {})
    latest_goal = goals.get(latest_goal_id, {})
    entry['runtime']['last_goal_status'] = latest_status
    entry['runtime']['last_goal_id'] = latest_goal_id
    entry['runtime']['last_status_at'] = received_at
    entry['runtime']['elapsed_time_ms'] = latest_goal.get(
        'elapsed_time_ms',
    )
    entry['runtime']['result_status'] = latest_goal.get('result_status')
    entry['runtime']['result_preview'] = latest_goal.get('result_preview')
    entry['runtime']['result_error'] = latest_goal.get('result_error')
    entry['runtime']['observed_goal_count'] = len(goals)


def update_feedback_runtime(
    entry: dict[str, Any],
    *,
    message: Any,
    received_at: float,
) -> None:
    """Update runtime state from an action feedback message."""
    feedback = getattr(message, 'feedback', message)
    entry['runtime']['last_feedback_at'] = received_at
    entry['runtime']['feedback_preview'] = message_to_preview(feedback)


def terminal_goals_ready_for_result(
    entry: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return observed terminal goals that have not requested result yet."""
    goals = entry.get('goals', {})
    return [
        goal for goal in goals.values()
        if goal.get('status') in TERMINAL_GOAL_STATUSES
        and goal.get('result_requested') is not True
    ]


def mark_goal_result_pending(
    entry: dict[str, Any],
    goal_id: str,
) -> None:
    """Mark a goal result request as pending."""
    goal = entry.get('goals', {}).get(goal_id)
    if goal is None:
        return

    goal['result_requested'] = True
    goal['result_status'] = 'pending'
    goal['result_error'] = None
    _sync_runtime_result(entry, goal)


def update_goal_result(
    entry: dict[str, Any],
    *,
    goal_id: str,
    state: dict[str, Any],
) -> None:
    """Store completed result lookup state for a goal."""
    goal = entry.get('goals', {}).get(goal_id)
    if goal is None:
        return

    goal.update(state)
    _sync_runtime_result(entry, goal)


def message_to_preview(message: Any, *, max_depth: int = 3) -> Any:
    """Convert a ROS message object into a small JSON-safe preview."""
    return _to_json_safe(message, depth=0, max_depth=max_depth)


def _goal_state(
    entry: dict[str, Any],
    goal_id: str,
    goal_id_message: Any,
) -> dict[str, Any]:
    goals = entry.setdefault('goals', {})
    goal = goals.get(goal_id)
    if goal is None:
        goal = {
            'goal_id': goal_id,
            'goal_id_msg': goal_id_message,
            'status': 'unknown',
            'accepted_at': None,
            'executing_at': None,
            'finished_at': None,
            'last_status_at': None,
            'elapsed_time_ms': None,
            'result_requested': False,
            'result_status': None,
            'result_preview': None,
            'result_error': None,
        }
        goals[goal_id] = goal
    return goal


def _update_goal_status(
    goal: dict[str, Any],
    status_label: str,
    received_at: float,
) -> None:
    goal['status'] = status_label
    goal['last_status_at'] = received_at
    if status_label == GOAL_STATUS_ACCEPTED:
        goal.setdefault('accepted_at', received_at)
        if goal['accepted_at'] is None:
            goal['accepted_at'] = received_at
    elif status_label == GOAL_STATUS_EXECUTING:
        goal.setdefault('executing_at', received_at)
        if goal['executing_at'] is None:
            goal['executing_at'] = received_at
    elif status_label in TERMINAL_GOAL_STATUSES:
        if goal.get('finished_at') is None:
            goal['finished_at'] = received_at
            goal['elapsed_time_ms'] = _elapsed_time_ms(goal)


def _elapsed_time_ms(goal: dict[str, Any]) -> float | None:
    finished_at = goal.get('finished_at')
    if finished_at is None:
        return None

    started_at = goal.get('accepted_at') or goal.get('executing_at')
    if started_at is None:
        return None

    return (finished_at - started_at) * 1000.0


def _sync_runtime_result(
    entry: dict[str, Any],
    goal: dict[str, Any],
) -> None:
    if entry.get('runtime', {}).get('last_goal_id') != goal.get('goal_id'):
        return

    entry['runtime']['result_status'] = goal.get('result_status')
    entry['runtime']['result_preview'] = goal.get('result_preview')
    entry['runtime']['result_error'] = goal.get('result_error')


def _to_json_safe(value: Any, *, depth: int, max_depth: int) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value

    if depth >= max_depth:
        return str(value)

    if isinstance(value, (list, tuple)):
        return [
            _to_json_safe(item, depth=depth + 1, max_depth=max_depth)
            for item in value[:10]
        ]

    slots = getattr(value, '__slots__', None)
    if slots:
        return {
            _public_slot_name(slot): _to_json_safe(
                getattr(value, slot),
                depth=depth + 1,
                max_depth=max_depth,
            )
            for slot in slots
            if hasattr(value, slot)
        }

    return str(value)


def _public_slot_name(slot: str) -> str:
    return slot[1:] if slot.startswith('_') else slot
