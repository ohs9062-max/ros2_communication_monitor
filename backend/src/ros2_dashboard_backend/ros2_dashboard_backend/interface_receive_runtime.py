"""Explicit Interface Lab receive/observe runtime."""

from __future__ import annotations

from time import time
from typing import Any, Callable

from rosidl_runtime_py.utilities import get_message

from ros2_dashboard_backend.interface_value_converter import ros_message_to_json


DEFAULT_TOPIC_HISTORY_LIMIT = 500
MAX_TOPIC_HISTORY_LIMIT = 500


class InterfaceReceiveError(ValueError):
    """Raised when receive/observe setup fails."""


class InterfaceReceiveRuntime:
    """Manage user-triggered topic subscriptions and receive history."""

    def __init__(self, *, lock: Any, node_getter: Callable[[], Any]) -> None:
        self._lock = lock
        self._node_getter = node_getter
        self._topics: dict[str, dict[str, Any]] = {}
        self._sequence = 0

    def clear(self) -> None:
        with self._lock:
            topics = list(self._topics.values())
            self._topics = {}
        node = self._node_getter()
        if node is None:
            return
        for item in topics:
            subscription = item.get('subscription')
            if subscription is not None:
                try:
                    node.destroy_subscription(subscription)
                except Exception:
                    pass

    def start_topic(
        self,
        *,
        topic_name: str,
        topic_type: str,
        history_limit: int = DEFAULT_TOPIC_HISTORY_LIMIT,
    ) -> dict[str, Any]:
        node = self._node_getter()
        if node is None:
            raise InterfaceReceiveError('ROS2 monitor node가 실행 중이 아닙니다.')
        topic_name = topic_name.strip()
        topic_type = topic_type.strip()
        if not topic_name.startswith('/'):
            raise InterfaceReceiveError('topic_name은 /로 시작해야 합니다.')
        try:
            message_class = get_message(topic_type)
        except Exception as exc:
            raise InterfaceReceiveError(f'topic type import 실패: {exc}') from exc
        limit = _normalize_limit(history_limit)
        with self._lock:
            if topic_name in self._topics:
                self._topics[topic_name]['history_limit'] = limit
                return self._topic_state(topic_name, self._topics[topic_name])
        subscription = node.create_subscription(
            message_class,
            topic_name,
            lambda message: self._record_topic_message(topic_name, topic_type, message),
            10,
        )
        with self._lock:
            self._topics[topic_name] = {
                'topic_name': topic_name,
                'topic_type': topic_type,
                'history_limit': limit,
                'subscription': subscription,
                'history': [],
                'message_count': 0,
                'last_message': None,
                'last_received_at': None,
                'error': None,
                'started_at': time(),
            }
            return self._topic_state(topic_name, self._topics[topic_name])

    def stop_topic(self, *, topic_name: str) -> dict[str, Any]:
        with self._lock:
            item = self._topics.pop(topic_name, None)
        if item is None:
            return {'topic_name': topic_name, 'receiving': False}
        node = self._node_getter()
        subscription = item.get('subscription')
        if node is not None and subscription is not None:
            try:
                node.destroy_subscription(subscription)
            except Exception as exc:
                return {'topic_name': topic_name, 'receiving': False, 'error': str(exc)}
        return {'topic_name': topic_name, 'receiving': False}

    def topics(self) -> dict[str, Any]:
        with self._lock:
            items = [
                self._topic_state(topic_name, item)
                for topic_name, item in sorted(self._topics.items())
            ]
        return {'topics': items, 'meta': {'count': len(items)}}

    def topic_history(self, *, topic_name: str | None = None, limit: int | None = None) -> dict[str, Any]:
        normalized_limit = _normalize_limit(limit or DEFAULT_TOPIC_HISTORY_LIMIT)
        with self._lock:
            if topic_name:
                items = list(self._topics.get(topic_name, {}).get('history', []))
            else:
                items = [
                    event
                    for item in self._topics.values()
                    for event in item.get('history', [])
                ]
        items.sort(key=lambda event: event.get('received_at') or 0, reverse=True)
        return {'history': items[:normalized_limit], 'meta': {'count': len(items[:normalized_limit])}}

    def reset_topic_history(self, *, topic_name: str | None = None) -> dict[str, Any]:
        """Clear accumulated explicit topic receive history."""
        cleared = 0
        with self._lock:
            if topic_name:
                item = self._topics.get(topic_name)
                if item is None:
                    return {'cleared': 0, 'topic_name': topic_name}
                cleared = len(item.get('history', []))
                item['history'] = []
                item['last_message'] = None
                item['last_received_at'] = None
                item['error'] = None
                return {'cleared': cleared, 'topic_name': topic_name}

            for item in self._topics.values():
                cleared += len(item.get('history', []))
                item['history'] = []
                item['last_message'] = None
                item['last_received_at'] = None
                item['error'] = None
        return {'cleared': cleared, 'topic_name': None}

    def _record_topic_message(self, topic_name: str, topic_type: str, message: Any) -> None:
        received_at = time()
        try:
            message_json = ros_message_to_json(message)
            error = None
        except Exception as exc:
            message_json = None
            error = str(exc)
        preview = message_json if message_json is not None else {'error': error}
        with self._lock:
            item = self._topics.get(topic_name)
            if item is None:
                return
            self._sequence += 1
            event = {
                'topic_name': topic_name,
                'topic_type': topic_type,
                'received_at': received_at,
                'sequence': self._sequence,
                'message_preview': preview,
                'message_json': message_json,
                'size_bytes': len(str(preview).encode('utf-8')),
                'error': error,
            }
            history = item.setdefault('history', [])
            history.insert(0, event)
            del history[int(item.get('history_limit') or DEFAULT_TOPIC_HISTORY_LIMIT):]
            item['message_count'] = int(item.get('message_count') or 0) + 1
            item['last_message'] = event
            item['last_received_at'] = received_at
            item['error'] = error

    @staticmethod
    def _topic_state(topic_name: str, item: dict[str, Any]) -> dict[str, Any]:
        return {
            'topic_name': topic_name,
            'topic_type': item.get('topic_type'),
            'receiving': True,
            'history_limit': item.get('history_limit'),
            'message_count': item.get('message_count', 0),
            'last_message': item.get('last_message'),
            'last_received_at': item.get('last_received_at'),
            'error': item.get('error'),
            'started_at': item.get('started_at'),
        }


def _normalize_limit(value: int) -> int:
    try:
        limit = int(value)
    except (TypeError, ValueError):
        limit = DEFAULT_TOPIC_HISTORY_LIMIT
    return max(1, min(limit, MAX_TOPIC_HISTORY_LIMIT))
