"""Alert builders for action monitoring."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.action.models import (
    ACTION_STATUS_WAITING_SERVER,
    ALERT_CODE_ACTION_GOAL_ABORTED,
    ALERT_CODE_ACTION_GOAL_CANCELED,
    ALERT_CODE_ACTION_RESULT_UNAVAILABLE,
    ALERT_CODE_ACTION_WAITING_SERVER,
    ALERT_LEVEL_ERROR,
    ALERT_LEVEL_WARNING,
    GOAL_STATUS_ABORTED,
    GOAL_STATUS_CANCELED,
    RESULT_STATUS_UNAVAILABLE,
)


def build_action_alerts(
    *,
    actions: list[dict[str, Any]],
    detected_at: float,
) -> list[dict[str, Any]]:
    """Build user-visible action alerts."""
    alerts = []
    for action in actions:
        if action.get('status') == ACTION_STATUS_WAITING_SERVER:
            alerts.append(
                _build_alert(
                    action=action,
                    detected_at=detected_at,
                    level=ALERT_LEVEL_WARNING,
                    code=ALERT_CODE_ACTION_WAITING_SERVER,
                    message='Action client exists but no server is available.',
                    last_received_at=None,
                ),
            )

        runtime = action.get('runtime', {})
        last_goal_status = runtime.get('last_goal_status')
        if last_goal_status == GOAL_STATUS_ABORTED:
            alerts.append(
                _build_alert(
                    action=action,
                    detected_at=detected_at,
                    level=ALERT_LEVEL_ERROR,
                    code=ALERT_CODE_ACTION_GOAL_ABORTED,
                    message='Action goal aborted.',
                    last_received_at=runtime.get('last_status_at'),
                ),
            )
        elif last_goal_status == GOAL_STATUS_CANCELED:
            alerts.append(
                _build_alert(
                    action=action,
                    detected_at=detected_at,
                    level=ALERT_LEVEL_WARNING,
                    code=ALERT_CODE_ACTION_GOAL_CANCELED,
                    message='Action goal canceled.',
                    last_received_at=runtime.get('last_status_at'),
                ),
            )

        if runtime.get('result_status') == RESULT_STATUS_UNAVAILABLE:
            alerts.append(
                _build_alert(
                    action=action,
                    detected_at=detected_at,
                    level=ALERT_LEVEL_WARNING,
                    code=ALERT_CODE_ACTION_RESULT_UNAVAILABLE,
                    message='Action result is unavailable.',
                    last_received_at=runtime.get('last_status_at'),
                ),
            )

    return alerts


def _build_alert(
    *,
    action: dict[str, Any],
    detected_at: float,
    level: str,
    code: str,
    message: str,
    last_received_at: float | None,
) -> dict[str, Any]:
    name = action['name']
    return {
        'id': f'action:{name}:{code}',
        'level': level,
        'source': 'action',
        'name': name,
        'code': code,
        'message': message,
        'status': action.get('status'),
        'last_received_at': last_received_at,
        'age_sec': None,
        'detected_at': detected_at,
    }
