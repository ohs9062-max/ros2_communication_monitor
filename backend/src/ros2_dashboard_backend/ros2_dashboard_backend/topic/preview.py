"""Topic 모니터링의 preview 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any, Callable

from ros2_dashboard_backend.topic.models import (
    MONITOR_STATUS_TYPE,
    SUPPORTED_PREVIEW_TYPES,
)


def build_message_preview(topic_type: str, message: Any) -> dict[str, Any]:
    """Topic 모니터링에서 public API 응답 항목을 조립하는 함수입니다."""
    builder = _preview_builders().get(topic_type)
    if builder is None:
        return {}

    return builder(message)


def is_preview_supported(topic_type: str | None) -> bool:
    """Topic 모니터링에서 조건 만족 여부를 판단하는 함수입니다."""
    if topic_type is None:
        return False

    return topic_type in SUPPORTED_PREVIEW_TYPES


def get_supported_preview_types() -> tuple[str, ...]:
    """Topic 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    return SUPPORTED_PREVIEW_TYPES


def _preview_builders() -> dict[str, Callable[[Any], dict[str, Any]]]:
    return {
        'sensor_msgs/msg/LaserScan': _laser_scan_preview,
        'nav_msgs/msg/Odometry': _odometry_preview,
        'sensor_msgs/msg/Imu': _imu_preview,
        'geometry_msgs/msg/Twist': _twist_preview,
        'geometry_msgs/msg/TwistStamped': _twist_stamped_preview,
        'sensor_msgs/msg/JointState': _joint_state_preview,
        'std_msgs/msg/String': _string_preview,
        MONITOR_STATUS_TYPE: _monitor_status_preview,
    }


def _laser_scan_preview(message: Any) -> dict[str, Any]:
    return {
        'angle_min': message.angle_min,
        'angle_max': message.angle_max,
        'angle_increment': message.angle_increment,
        'range_min': message.range_min,
        'range_max': message.range_max,
        'range_count': len(message.ranges),
        'ranges_sample': list(message.ranges[:5]),
    }


def _odometry_preview(message: Any) -> dict[str, Any]:
    return {
        'position': _vector_preview(message.pose.pose.position),
        'orientation': _quaternion_preview(message.pose.pose.orientation),
        'linear': _vector_preview(message.twist.twist.linear),
        'angular': _vector_preview(message.twist.twist.angular),
    }


def _imu_preview(message: Any) -> dict[str, Any]:
    return {
        'orientation': _quaternion_preview(message.orientation),
        'angular_velocity': _vector_preview(message.angular_velocity),
        'linear_acceleration': _vector_preview(message.linear_acceleration),
    }


def _twist_preview(message: Any) -> dict[str, Any]:
    return {
        'linear': _vector_preview(message.linear),
        'angular': _vector_preview(message.angular),
    }


def _twist_stamped_preview(message: Any) -> dict[str, Any]:
    return _twist_preview(message.twist)


def _joint_state_preview(message: Any) -> dict[str, Any]:
    return {
        'name': list(message.name),
        'position_sample': list(message.position[:5]),
        'velocity_sample': list(message.velocity[:5]),
        'effort_sample': list(message.effort[:5]),
    }


def _string_preview(message: Any) -> dict[str, Any]:
    return {
        'data': message.data,
    }


def _monitor_status_preview(message: Any) -> dict[str, Any]:
    preview = {
        'device_name': _text_or_empty(getattr(message, 'device_name', '')),
        'node_name': _text_or_empty(getattr(message, 'node_name', '')),
        'source': _text_or_empty(getattr(message, 'source', '')),
        'level': _text_or_empty(getattr(message, 'level', '')),
        'status': _text_or_empty(getattr(message, 'status', '')),
        'message': _text_or_empty(getattr(message, 'message', '')),
        'stamp': _stamp_preview(getattr(message, 'stamp', None)),
    }
    preview.update(_build_key_value_preview(message))
    return preview


def _build_key_value_preview(message: Any) -> dict[str, Any]:
    values = getattr(message, 'values', None)
    if values is None:
        return {
            'values': [],
        }

    try:
        iterator = iter(values)
    except TypeError:
        return {
            'values': [],
        }

    return {
        'values': [
            {
                'key': _json_safe_value(getattr(value, 'key', None)),
                'value': _json_safe_value(getattr(value, 'value', None)),
                'value_type': _text_or_empty(
                    getattr(value, 'value_type', ''),
                ),
                'unit': _text_or_empty(getattr(value, 'unit', '')),
            }
            for value in iterator
        ],
    }


def _json_safe_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value

    if isinstance(value, (list, tuple)):
        return [_json_safe_value(item) for item in value]

    return str(value)


def _text_or_empty(value: Any) -> str:
    if value is None:
        return ''

    if isinstance(value, str):
        return value

    return str(value)


def _stamp_preview(message: Any) -> dict[str, Any]:
    return {
        'sec': _json_safe_value(getattr(message, 'sec', None)),
        'nanosec': _json_safe_value(getattr(message, 'nanosec', None)),
    }


def _vector_preview(message: Any) -> dict[str, float]:
    return {
        'x': message.x,
        'y': message.y,
        'z': message.z,
    }


def _quaternion_preview(message: Any) -> dict[str, float]:
    return {
        'x': message.x,
        'y': message.y,
        'z': message.z,
        'w': message.w,
    }
