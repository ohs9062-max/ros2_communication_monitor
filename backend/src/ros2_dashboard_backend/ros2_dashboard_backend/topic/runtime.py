"""Topic 모니터링의 runtime 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

import logging
from importlib import import_module
from time import time
from typing import Any, Callable

from rclpy.qos import QoSProfile, qos_profile_sensor_data

from ros2_dashboard_backend.config_loader import MonitorConfig
from ros2_dashboard_backend.topic.discovery import build_topic_item
from ros2_dashboard_backend.topic.filters import (
    is_supported_type,
    is_topic_included,
    should_deep_monitor,
)
from ros2_dashboard_backend.topic.hz import (
    build_hz_snapshot,
    recent_timestamps,
)
from ros2_dashboard_backend.topic.models import (
    SENSOR_PREVIEW_TYPES,
    copy_message_preview,
)
from ros2_dashboard_backend.topic.preview import build_message_preview
from ros2_dashboard_backend.topic.subscriptions import (
    DEFAULT_SUBSCRIPTION_CLEANUP_AFTER_SEC,
    build_subscription_entry,
    cleanup_candidates,
    has_subscription,
    remove_subscription_entry,
    update_subscription_entry,
)


LOGGER = logging.getLogger(__name__)


class TopicRuntime:
    """Topic 모니터링 runtime 상태와 cache를 관리하는 클래스입니다."""

    def __init__(
        self,
        *,
        action_monitor_subscriber_count: Callable[[str], int],
        config: MonitorConfig,
        lock: Any,
        node_getter: Callable[[], Any],
    ) -> None:
        """Topic 모니터링에서 내부 보조 처리를 수행하는 내부 helper 함수입니다."""
        self._action_monitor_subscriber_count = (
            action_monitor_subscriber_count
        )
        self._config = config
        self._lock = lock
        self._node_getter = node_getter
        self._topics: list[dict[str, Any]] = []
        self._last_updated = 0.0
        self._subscriptions: dict[str, dict[str, Any]] = {}

    def clear(self) -> None:
        """Topic 모니터링에서 cache와 runtime 상태를 초기화하는 함수입니다."""
        with self._lock:
            self._topics = []
            self._last_updated = 0.0
            self._subscriptions = {}

    def snapshot(self) -> dict[str, Any]:
        """Topic 모니터링에서 cache snapshot을 반환하는 함수입니다."""
        with self._lock:
            topics = [topic.copy() for topic in self._topics]
            subscriptions = {
                name: {
                    'message_preview': copy_message_preview(entry.get('message_preview')),
                    'last_received_at': entry.get('last_received_at'),
                    'message_count': len(entry.get('timestamps', [])),
                }
                for name, entry in self._subscriptions.items()
            }
            last_updated = self._last_updated

        for topic in topics:
            latest = subscriptions.get(topic.get('name'), {})
            preview = latest.get('message_preview')
            topic['allowlisted'] = bool(topic.get('supported_type') or topic.get('deep_monitoring'))
            topic['observed'] = preview is not None
            topic['last_message_preview'] = preview
            topic['last_received_at'] = latest.get('last_received_at')
            topic['message_count'] = latest.get('message_count', 0)
            topic['detailed_monitoring_enabled'] = bool(topic.get('deep_monitoring'))
            topic['last_error'] = None

        return {
            'topics': topics,
            'count': len(topics),
            'last_updated': last_updated,
        }

    def alert_snapshot(
        self,
    ) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
        """Topic 모니터링에서 cache snapshot을 반환하는 함수입니다."""
        with self._lock:
            topics = [topic.copy() for topic in self._topics]
            subscriptions = {
                name: {
                    'created_at': entry.get('created_at'),
                    'last_received_at': entry.get('last_received_at'),
                    'message_preview': copy_message_preview(
                        entry.get('message_preview'),
                    ),
                }
                for name, entry in self._subscriptions.items()
            }

        return topics, subscriptions

    def update(self) -> None:
        """Topic 모니터링에서 runtime 상태를 갱신하는 함수입니다."""
        node = self._node_getter()
        if node is None:
            return

        topics = []
        updated_at = time()
        topic_names_and_types = node.get_topic_names_and_types()
        graph_topic_names = {
            name for name, _types in topic_names_and_types
        }

        for name, types in topic_names_and_types:
            if not self._is_topic_included(name):
                continue

            topic_type = types[0] if types else None
            supported_type = self._is_supported_type(topic_type)
            deep_monitoring = self._auto_subscribe_topic(
                name,
                topic_type,
                supported_type,
            )
            publisher_count = node.count_publishers(name)
            raw_subscriber_count = node.count_subscribers(name)
            monitor_subscriber_count = self._monitor_subscriber_count(
                name,
                topic_type,
            )
            external_subscriber_count = max(
                0,
                raw_subscriber_count - monitor_subscriber_count,
            )
            topics.append(
                build_topic_item(
                    name=name,
                    types=list(types),
                    publisher_count=publisher_count,
                    raw_subscriber_count=raw_subscriber_count,
                    monitor_subscriber_count=monitor_subscriber_count,
                    external_subscriber_count=external_subscriber_count,
                    updated_at=updated_at,
                    supported_type=supported_type,
                    deep_monitoring=deep_monitoring,
                ),
            )

        topics.sort(key=lambda topic: topic['name'])

        with self._lock:
            self._topics = topics
            self._last_updated = updated_at

        self._cleanup_disappeared_subscriptions(
            graph_topic_names,
            updated_at,
        )

    def latest_message(self, name: str) -> dict[str, Any]:
        """Topic 모니터링에서 요청된 처리를 수행하는 함수입니다."""
        if self._node_getter() is None:
            return self._latest_response(
                success=False,
                name=name,
                message='ROS2 monitor is not running',
            )

        topic_type = self._topic_type(name)
        if topic_type is None:
            return self._latest_response(
                success=False,
                name=name,
                message='Topic not found',
            )

        if not self._is_supported_type(topic_type):
            return self._latest_response(
                success=False,
                name=name,
                topic_type=topic_type,
                message='unsupported topic type',
            )

        message_class = self._message_class(topic_type)
        if message_class is None:
            return self._latest_response(
                success=False,
                name=name,
                topic_type=topic_type,
                message='Failed to import topic message class',
            )

        self._ensure_subscription(name, topic_type, message_class)

        with self._lock:
            entry = self._subscriptions.get(name, {})
            message_preview = entry.get('message_preview')
            last_received_at = entry.get('last_received_at')

        return self._latest_response(
            success=True,
            name=name,
            topic_type=topic_type,
            received=message_preview is not None,
            last_received_at=last_received_at,
            message_preview=message_preview,
            message='Latest topic message fetched successfully',
        )

    def topic_hz(self, name: str) -> dict[str, Any]:
        """Topic 모니터링에서 요청된 처리를 수행하는 함수입니다."""
        if self._node_getter() is None:
            return self._hz_response(
                success=False,
                name=name,
                message='ROS2 monitor is not running',
            )

        topic_type = self._topic_type(name)
        if topic_type is None:
            return self._hz_response(
                success=False,
                name=name,
                message='Topic not found',
            )

        if not self._is_supported_type(topic_type):
            return self._hz_response(
                success=False,
                name=name,
                topic_type=topic_type,
                message='unsupported topic type',
            )

        message_class = self._message_class(topic_type)
        if message_class is None:
            return self._hz_response(
                success=False,
                name=name,
                topic_type=topic_type,
                message='Failed to import topic message class',
            )

        self._ensure_subscription(name, topic_type, message_class)
        return self._topic_hz_snapshot(name, topic_type)

    def _is_topic_included(self, name: str) -> bool:
        return is_topic_included(
            name,
            include_names=self._config.topics_include,
            exclude_names=self._config.topics_exclude,
        )

    def _topic_type(self, name: str) -> str | None:
        with self._lock:
            for topic in self._topics:
                if topic.get('name') != name:
                    continue

                topic_types = topic.get('types')
                if isinstance(topic_types, list) and topic_types:
                    return topic_types[0]

        return None

    def _is_supported_type(self, topic_type: str | None) -> bool:
        return is_supported_type(
            topic_type,
            supported_types=self._config.topics_supported_types,
        )

    def _auto_subscribe_topic(
        self,
        name: str,
        topic_type: str | None,
        supported_type: bool,
    ) -> bool:
        if not should_deep_monitor(
            auto_discover=self._config.topics_auto_discover,
            auto_subscribe_supported_types=(
                self._config.topics_auto_subscribe_supported_types
            ),
            topic_type=topic_type,
            supported_type=supported_type,
        ):
            return False

        message_class = self._message_class(topic_type)
        if message_class is None:
            return False

        self._ensure_subscription(name, topic_type, message_class)
        return self._has_subscription(name, topic_type)

    def _ensure_subscription(
        self,
        name: str,
        topic_type: str,
        message_class: type,
    ) -> None:
        node = self._node_getter()
        if node is None:
            return

        with self._lock:
            entry = self._subscriptions.get(name)
            if has_subscription(entry, topic_type=topic_type):
                return

            if entry is not None:
                node.destroy_subscription(entry['subscription'])

            subscription = node.create_subscription(
                message_class,
                name,
                self._latest_message_callback(name, topic_type),
                self._qos_profile(topic_type),
            )
            self._subscriptions[name] = build_subscription_entry(
                topic_type=topic_type,
                subscription=subscription,
            )

    def _has_subscription(self, name: str, topic_type: str) -> bool:
        with self._lock:
            entry = self._subscriptions.get(name)
            return has_subscription(entry, topic_type=topic_type)

    def _monitor_subscriber_count(
        self,
        name: str,
        topic_type: str | None,
    ) -> int:
        if topic_type is None:
            return 0

        with self._lock:
            entry = self._subscriptions.get(name)

        action_count = self._action_monitor_subscriber_count(name)
        if has_subscription(entry, topic_type=topic_type):
            return 1 + action_count

        return action_count

    def _cleanup_disappeared_subscriptions(
        self,
        graph_topic_names: set[str],
        now: float,
    ) -> None:
        node = self._node_getter()
        if node is None:
            return

        with self._lock:
            candidates = cleanup_candidates(
                self._subscriptions,
                graph_topic_names=graph_topic_names,
                now=now,
                cleanup_after_sec=(
                    DEFAULT_SUBSCRIPTION_CLEANUP_AFTER_SEC
                ),
            )

        for name, subscription in candidates:
            try:
                node.destroy_subscription(subscription)
            except Exception as exc:  # pragma: no cover
                LOGGER.warning(
                    'Failed to destroy subscription for disappeared topic '
                    '%s: %s',
                    name,
                    exc,
                )
                continue

            with self._lock:
                remove_subscription_entry(
                    self._subscriptions,
                    name=name,
                    subscription=subscription,
                )

    def _latest_message_callback(self, name: str, topic_type: str):
        def callback(message: Any) -> None:
            received_at = time()
            preview = build_message_preview(topic_type, message)
            with self._lock:
                entry = self._subscriptions.get(name)
                if entry is None:
                    return

                update_subscription_entry(
                    entry,
                    message_preview=preview,
                    received_at=received_at,
                    window_sec=self._config.hz_window_sec,
                )

        return callback

    def _topic_hz_snapshot(
        self,
        name: str,
        topic_type: str,
    ) -> dict[str, Any]:
        now = time()
        with self._lock:
            entry = self._subscriptions.get(name, {})
            timestamps = recent_timestamps(
                entry.get('timestamps', []),
                now=now,
                window_sec=self._config.hz_window_sec,
            )
            entry['timestamps'] = timestamps
            last_received_at = entry.get('last_received_at')

        snapshot = build_hz_snapshot(
            timestamps=timestamps,
            last_received_at=last_received_at,
            window_sec=self._config.hz_window_sec,
            stale_timeout_sec=self._config.stale_timeout_sec,
            now=now,
        )

        return self._hz_response(
            success=True,
            name=name,
            topic_type=topic_type,
            received=snapshot['received'],
            message_count=snapshot['message_count'],
            window_sec=snapshot['window_sec'],
            hz=snapshot['hz'],
            last_received_at=snapshot['last_received_at'],
            age_sec=snapshot['age_sec'],
            is_stale=snapshot['is_stale'],
            status=snapshot['status'],
            message='Topic Hz fetched successfully',
        )

    @staticmethod
    def _message_class(topic_type: str) -> type | None:
        parts = topic_type.split('/')
        if len(parts) != 3 or parts[1] != 'msg':
            return None

        try:
            module = import_module(f'{parts[0]}.msg')
        except ImportError:
            return None

        return getattr(module, parts[2], None)

    @staticmethod
    def _qos_profile(topic_type: str):
        if topic_type in SENSOR_PREVIEW_TYPES:
            return qos_profile_sensor_data

        return QoSProfile(depth=10)

    @staticmethod
    def _latest_response(
        *,
        success: bool,
        name: str,
        message: str,
        topic_type: str | None = None,
        received: bool = False,
        last_received_at: float | None = None,
        message_preview: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            'success': success,
            'data': {
                'name': name,
                'type': topic_type,
                'received': received,
                'last_received_at': last_received_at,
                'message_preview': message_preview,
            },
            'message': message,
        }

    @staticmethod
    def _hz_response(
        *,
        success: bool,
        name: str,
        message: str,
        topic_type: str | None = None,
        received: bool = False,
        message_count: int = 0,
        window_sec: float = 5.0,
        hz: float = 0.0,
        last_received_at: float | None = None,
        age_sec: float | None = None,
        is_stale: bool = False,
        status: str = 'never_received',
    ) -> dict[str, Any]:
        return {
            'success': success,
            'data': {
                'name': name,
                'type': topic_type,
                'received': received,
                'message_count': message_count,
                'window_sec': window_sec,
                'hz': hz,
                'last_received_at': last_received_at,
                'age_sec': age_sec,
                'is_stale': is_stale,
                'status': status,
            },
            'message': message,
        }
