"""Topic 모니터링의 models 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any


MONITOR_STATUS_TYPE = 'ros2_dashboard_interfaces/msg/MonitorStatus'

SUPPORTED_PREVIEW_TYPES = (
    'sensor_msgs/msg/LaserScan',
    'nav_msgs/msg/Odometry',
    'sensor_msgs/msg/Imu',
    'geometry_msgs/msg/Twist',
    'geometry_msgs/msg/TwistStamped',
    'sensor_msgs/msg/JointState',
    MONITOR_STATUS_TYPE,
)

SENSOR_PREVIEW_TYPES = {
    'sensor_msgs/msg/LaserScan',
    'sensor_msgs/msg/Imu',
    'sensor_msgs/msg/JointState',
}

TOPIC_STATUS_ACTIVE = 'active'
TOPIC_STATUS_NO_SUBSCRIBER = 'no_subscriber'
TOPIC_STATUS_WAITING_PUBLISHER = 'waiting_publisher'
TOPIC_STATUS_INACTIVE = 'inactive'

HZ_STATUS_NEVER_RECEIVED = 'never_received'
HZ_STATUS_STALE = 'stale'

ALERT_LEVEL_INFO = 'info'
ALERT_LEVEL_WARNING = 'warning'
ALERT_LEVEL_ERROR = 'error'
ALERT_LEVEL_CRITICAL = 'critical'

ALERT_CODE_WAITING_PUBLISHER = 'waiting_publisher'
ALERT_CODE_TOPIC_MESSAGE_MISSING = 'topic_message_missing'
ALERT_CODE_TOPIC_STALE = 'topic_stale'
ALERT_CODE_TOPIC_INACTIVE = 'topic_inactive'


def topic_status(
    publisher_count: int,
    subscriber_count: int,
) -> tuple[str, str]:
    """Topic 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    if publisher_count > 0 and subscriber_count > 0:
        return TOPIC_STATUS_ACTIVE, 'publisher and subscriber exist'

    if publisher_count > 0 and subscriber_count == 0:
        return TOPIC_STATUS_NO_SUBSCRIBER, (
            'publisher exists but no subscriber'
        )

    if publisher_count == 0 and subscriber_count > 0:
        return TOPIC_STATUS_WAITING_PUBLISHER, (
            'subscriber exists but no publisher'
        )

    return TOPIC_STATUS_INACTIVE, 'no publisher and no subscriber'


def topic_primary_type(topic: dict[str, Any]) -> str | None:
    """Topic 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    topic_types = topic.get('types')
    if isinstance(topic_types, list) and topic_types:
        return topic_types[0]

    return None


def text_or_empty(value: Any) -> str:
    """Topic 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    if value is None:
        return ''

    if isinstance(value, str):
        return value

    return str(value)


def copy_message_preview(value: Any) -> dict[str, Any] | None:
    """Topic 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    if not isinstance(value, dict):
        return None

    return value.copy()


def copy_values(value: Any) -> list[dict[str, Any]]:
    """Topic 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    if not isinstance(value, list):
        return []

    return [item.copy() for item in value if isinstance(item, dict)]
