"""Topic 모니터링의 alerts 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.topic.models import (
    ALERT_CODE_TOPIC_MESSAGE_MISSING,
    ALERT_CODE_TOPIC_STALE,
    ALERT_CODE_WAITING_PUBLISHER,
    ALERT_LEVEL_CRITICAL,
    ALERT_LEVEL_ERROR,
    ALERT_LEVEL_WARNING,
    HZ_STATUS_NEVER_RECEIVED,
    HZ_STATUS_STALE,
    MONITOR_STATUS_TYPE,
    TOPIC_STATUS_WAITING_PUBLISHER,
    copy_values,
    text_or_empty,
    topic_primary_type,
)


REQUIRED_STREAM_TOPIC_NAMES = {
    '/imu',
    '/joint_states',
    '/odom',
    '/scan',
}

COMMAND_TOPIC_NAMES = {
    '/cmd_vel',
    '/cmd_vel_smoothed',
}

ALERT_RESOLVED_RETENTION_SEC = 60.0


def build_alerts(
    *,
    topics: list[dict[str, Any]],
    subscriptions: dict[str, dict[str, Any]],
    detected_at: float,
    stale_timeout_sec: float,
) -> list[dict[str, Any]]:
    """Topic 모니터링에서 Alert 항목을 조립하는 함수입니다."""
    alerts_by_id = {}
    for topic in topics:
        for alert_item in _topic_alerts(
            topic=topic,
            subscriptions=subscriptions,
            detected_at=detected_at,
            stale_timeout_sec=stale_timeout_sec,
        ):
            alerts_by_id[alert_item['id']] = alert_item

        monitor_status_alert = _monitor_status_alert(
            topic=topic,
            subscriptions=subscriptions,
            detected_at=detected_at,
        )
        if monitor_status_alert is not None:
            alerts_by_id[monitor_status_alert['id']] = monitor_status_alert

    return list(alerts_by_id.values())


def retain_alerts(
    *,
    alert_history: list[dict[str, Any]] | None = None,
    current_alerts: list[dict[str, Any]],
    history_limit: int = 50,
    retained_alerts: dict[str, dict[str, Any]],
    retained_codes: set[str],
    detected_at: float,
    resolved_retention_sec: float = ALERT_RESOLVED_RETENTION_SEC,
) -> list[dict[str, Any]]:
    """상태 기반 Alert를 해결 시각부터 일정 시간 메모리에 유지합니다."""
    current_by_id = {
        alert['id']: alert
        for alert in current_alerts
        if alert.get('code') in retained_codes
    }
    passthrough = [
        alert for alert in current_alerts
        if alert.get('code') not in retained_codes
    ]
    visible = []

    for alert_id, alert in current_by_id.items():
        cached = retained_alerts.get(alert_id, {})
        active_alert = {
            **alert,
            'active': True,
            'alert_state': 'active',
            'first_detected_at': cached.get(
                'first_detected_at',
                detected_at,
            ),
            'last_detected_at': detected_at,
            'resolved_at': None,
        }
        retained_alerts[alert_id] = active_alert
        visible.append(active_alert.copy())

    for alert_id, cached in list(retained_alerts.items()):
        if alert_id in current_by_id:
            continue

        was_resolved = cached.get('alert_state') == 'resolved'
        resolved_at = cached.get('resolved_at') or detected_at
        if detected_at - float(resolved_at) >= resolved_retention_sec:
            retained_alerts.pop(alert_id, None)
            continue

        resolved_alert = {
            **cached,
            'active': False,
            'alert_state': 'resolved',
            'resolved_at': resolved_at,
        }
        retained_alerts[alert_id] = resolved_alert
        visible.append(resolved_alert.copy())
        if alert_history is not None and not was_resolved:
            alert_history.insert(
                0,
                {
                    **resolved_alert,
                    'origin_id': alert_id,
                    'id': f'{alert_id}:resolved:{resolved_at}',
                },
            )
            del alert_history[history_limit:]

    return passthrough + visible


def build_alert_meta(alerts: list[dict[str, Any]]) -> dict[str, int]:
    """Topic 모니터링에서 Alert 항목을 조립하는 함수입니다."""
    active_alerts = [
        alert for alert in alerts
        if alert.get('alert_state') != 'resolved'
    ]
    return {
        'count': len(alerts),
        'active_count': len(active_alerts),
        'resolved_count': len(alerts) - len(active_alerts),
        'info_count': sum(
            1 for alert in active_alerts if alert['level'] == 'info'
        ),
        'warning_count': sum(
            1
            for alert in active_alerts
            if alert['level'] == ALERT_LEVEL_WARNING
        ),
        'error_count': sum(
            1
            for alert in active_alerts
            if alert['level'] == ALERT_LEVEL_ERROR
        ),
        'critical_count': sum(
            1
            for alert in active_alerts
            if alert['level'] == ALERT_LEVEL_CRITICAL
        ),
    }


def _topic_alerts(
    *,
    topic: dict[str, Any],
    subscriptions: dict[str, dict[str, Any]],
    detected_at: float,
    stale_timeout_sec: float,
) -> list[dict[str, Any]]:
    name = topic['name']
    publisher_count = topic['publisher_count']
    subscription = subscriptions.get(name)

    if name in COMMAND_TOPIC_NAMES:
        return []

    if (
        name not in REQUIRED_STREAM_TOPIC_NAMES
        and topic.get('registered_interface_type') is not True
    ):
        return []

    if topic.get('status') == 'disconnected':
        return [
            _alert(
                level=ALERT_LEVEL_ERROR,
                source='topic',
                name=name,
                code='topic_disconnected',
                status='disconnected',
                message=(
                    'Topic connection lost; it is no longer visible '
                    'in the ROS2 graph.'
                ),
                last_received_at=topic.get('last_seen_at'),
                age_sec=None,
                detected_at=detected_at,
            ),
        ]

    if publisher_count > 0 and subscription is not None:
        return _topic_message_alerts(
            name=name,
            first_observed_at=subscription.get('created_at'),
            last_received_at=subscription.get('last_received_at'),
            detected_at=detected_at,
            stale_timeout_sec=stale_timeout_sec,
        )

    if publisher_count == 0:
        return [
            _alert(
                level=ALERT_LEVEL_WARNING,
                source='topic',
                name=name,
                code=ALERT_CODE_WAITING_PUBLISHER,
                status=TOPIC_STATUS_WAITING_PUBLISHER,
                message='Subscriber exists but no publisher is available.',
                last_received_at=None,
                age_sec=None,
                detected_at=detected_at,
            ),
        ]

    return []


def _topic_message_alerts(
    *,
    name: str,
    first_observed_at: float | None,
    last_received_at: float | None,
    detected_at: float,
    stale_timeout_sec: float,
) -> list[dict[str, Any]]:
    if last_received_at is None:
        if (
            first_observed_at is None or
            detected_at - first_observed_at <= stale_timeout_sec
        ):
            return []

        return [
            _alert(
                level=ALERT_LEVEL_WARNING,
                source='topic',
                name=name,
                code=ALERT_CODE_TOPIC_MESSAGE_MISSING,
                status=HZ_STATUS_NEVER_RECEIVED,
                message=(
                    'Topic publisher exists but no message has been '
                    'received.'
                ),
                last_received_at=None,
                age_sec=None,
                detected_at=detected_at,
            ),
        ]

    age_sec = detected_at - last_received_at
    if age_sec > stale_timeout_sec:
        return [
            _alert(
                level=ALERT_LEVEL_WARNING,
                source='topic',
                name=name,
                code=ALERT_CODE_TOPIC_STALE,
                status=HZ_STATUS_STALE,
                message=(
                    'Topic message has not been received within stale '
                    'timeout.'
                ),
                last_received_at=last_received_at,
                age_sec=age_sec,
                detected_at=detected_at,
            ),
        ]

    return []


def _monitor_status_alert(
    *,
    topic: dict[str, Any],
    subscriptions: dict[str, dict[str, Any]],
    detected_at: float,
) -> dict[str, Any] | None:
    if topic_primary_type(topic) != MONITOR_STATUS_TYPE:
        return None

    name = topic['name']
    subscription = subscriptions.get(name)
    if subscription is None:
        return None

    preview = subscription.get('message_preview')
    if not isinstance(preview, dict):
        return None

    level = _normalized_level(preview.get('level'))
    if level not in (
        ALERT_LEVEL_WARNING,
        ALERT_LEVEL_ERROR,
        ALERT_LEVEL_CRITICAL,
    ):
        return None

    last_received_at = subscription.get('last_received_at')
    age_sec = None
    if last_received_at is not None:
        age_sec = detected_at - last_received_at

    device_name = text_or_empty(preview.get('device_name', ''))
    status = text_or_empty(preview.get('status', ''))
    message = text_or_empty(preview.get('message', ''))
    if not message:
        message = f'MonitorStatus reported {level}.'

    return {
        'id': _monitor_status_alert_id(
            name=name,
            device_name=device_name,
            level=level,
            status=status,
        ),
        'level': level,
        'source': 'monitor_status',
        'name': name,
        'code': f'monitor_status_{level}',
        'message': message,
        'status': status,
        'device_name': device_name,
        'node_name': text_or_empty(preview.get('node_name', '')),
        'values': copy_values(preview.get('values')),
        'last_received_at': last_received_at,
        'age_sec': age_sec,
        'detected_at': detected_at,
    }


def _normalized_level(value: Any) -> str:
    if value is None:
        return ''

    return str(value).strip().lower()


def _monitor_status_alert_id(
    *,
    name: str,
    device_name: str,
    level: str,
    status: str,
) -> str:
    parts = ['monitor_status', name, device_name, level]
    if status:
        parts.append(status)

    return ':'.join(parts)


def _alert(
    *,
    level: str,
    source: str,
    name: str,
    code: str,
    status: str,
    message: str,
    last_received_at: float | None,
    age_sec: float | None,
    detected_at: float,
) -> dict[str, Any]:
    return {
        'id': f'{source}:{name}:{code}',
        'level': level,
        'source': source,
        'name': name,
        'code': code,
        'message': message,
        'status': status,
        'last_received_at': last_received_at,
        'age_sec': age_sec,
        'detected_at': detected_at,
    }
