"""Interface Lab의 topic_runtime 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from time import sleep, time
from typing import Any, Callable

from rosidl_runtime_py.utilities import get_message

from ros2_dashboard_backend.interface_lab.apply.runtime import refresh_install_python_paths
from ros2_dashboard_backend.interface_lab.management.packages import registered_package_messages
from ros2_dashboard_backend.interface_lab.management.registry import registry_snapshot
from ros2_dashboard_backend.interface_lab.common.value_converter import (
    InterfaceValidationError,
    build_ros_message,
    ros_message_to_json,
    schema_from_message_type,
)


DEFAULT_TOPIC_HISTORY_LIMIT = 500
MAX_TOPIC_HISTORY_LIMIT = 500
MAX_PUBLISH_HISTORY_ITEMS = 100


class InterfaceReceiveError(ValueError):
    """Interface Lab에서 발생하는 예외를 표현하는 클래스입니다."""


class InterfaceReceiveRuntime:
    """Interface Lab runtime 상태와 cache를 관리하는 클래스입니다."""

    def __init__(self, *, lock: Any, node_getter: Callable[[], Any]) -> None:
        self._lock = lock
        self._node_getter = node_getter
        self._topics: dict[tuple[str, str], dict[str, Any]] = {}
        self._publishers: dict[tuple[str, str], Any] = {}
        self._publish_history: list[dict[str, Any]] = []
        self._sequence = 0

    def clear(self) -> None:
        with self._lock:
            topics = list(self._topics.values())
            self._topics = {}
            publishers = list(self._publishers.values())
            self._publishers = {}
            self._publish_history = []
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
        for publisher in publishers:
            try:
                node.destroy_publisher(publisher)
            except Exception:
                pass

    def message_schema(self, *, message_type: str) -> dict[str, Any]:
        """Interface Lab에서 interface schema를 반환하는 함수입니다."""
        refresh_install_python_paths()
        message_type = message_type.strip()
        entry = self._registered_message(message_type)
        if entry is None:
            raise InterfaceReceiveError('registry에 등록된 Message full_type이 아닙니다.')
        schema = entry.get('message_schema') or []
        if entry.get('import_available') is True and not schema:
            schema = schema_from_message_type(message_type)
        return {
            **entry,
            'message_schema': schema,
            'graph_topics': self._graph_topics_for_type(message_type),
        }

    def callable_messages(self) -> dict[str, Any]:
        """Interface Lab에서 현재 실행 가능한 후보를 조회하는 함수입니다."""
        refresh_install_python_paths()
        messages = []
        graph = self._topic_graph()
        for entry in self._registered_messages():
            message_type = entry['message_type']
            matching = [item for item in graph if item['type'] == message_type]
            conflicts = [
                item for item in graph
                if item['name'] in {match['name'] for match in matching}
                and item['type'] != message_type
            ]
            messages.append({
                **entry,
                'full_type': message_type,
                'topic_type': message_type,
                'message_schema': entry.get('message_schema') or (
                    schema_from_message_type(message_type)
                    if entry.get('import_available') is True else []
                ),
                'graph_topics': matching,
                'graph_conflicts': conflicts,
            })
        messages.sort(key=lambda item: (item.get('message_type') or '', item.get('source') or ''))
        return {
            'messages': messages,
            'meta': {
                'count': len(messages),
                'import_available_count': sum(1 for item in messages if item.get('import_available') is True),
            },
        }

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
        self._ensure_registered_message(topic_type)
        try:
            message_class = get_message(topic_type)
        except Exception as exc:
            raise InterfaceReceiveError(f'topic type import 실패: {exc}') from exc
        limit = _normalize_limit(history_limit)
        graph_state = self._topic_graph_state(topic_name=topic_name, topic_type=topic_type)
        key = (topic_name, topic_type)
        with self._lock:
            existing = self._topics.get(key)
            if existing is not None and existing.get('subscription') is not None:
                existing['history_limit'] = limit
                existing['graph_state'] = graph_state
                existing['receiving'] = True
                return self._topic_state(key, existing)
        subscription = node.create_subscription(
            message_class,
            topic_name,
            lambda message: self._record_topic_message(topic_name, topic_type, message),
            _default_qos(topic_type),
        )
        with self._lock:
            previous = self._topics.get(key) or {}
            self._topics[key] = {
                'topic_name': topic_name,
                'topic_type': topic_type,
                'history_limit': limit,
                'subscription': subscription,
                'receiving': True,
                'qos': _qos_info(topic_type),
                'graph_state': graph_state,
                'history': previous.get('history', []),
                'message_count': previous.get('message_count', 0),
                'last_message': previous.get('last_message'),
                'last_received_at': previous.get('last_received_at'),
                'error': previous.get('error'),
                'started_at': time(),
            }
            return self._topic_state(key, self._topics[key])

    def stop_topic(self, *, topic_name: str, topic_type: str | None = None) -> dict[str, Any]:
        topic_name = topic_name.strip()
        topic_type = topic_type.strip() if topic_type else None
        with self._lock:
            if topic_type:
                key = (topic_name, topic_type)
                item = self._topics.get(key)
            else:
                key, item = next(
                    (
                        (candidate_key, candidate)
                        for candidate_key, candidate in self._topics.items()
                        if candidate_key[0] == topic_name
                    ),
                    ((topic_name, ''), None),
                )
        if item is None:
            return {'topic_name': topic_name, 'topic_type': topic_type, 'receiving': False}
        node = self._node_getter()
        subscription = item.get('subscription')
        if node is not None and subscription is not None:
            try:
                node.destroy_subscription(subscription)
            except Exception as exc:
                return {'topic_name': topic_name, 'topic_type': key[1], 'receiving': False, 'error': str(exc)}
        with self._lock:
            item['subscription'] = None
            item['receiving'] = False
        return {'topic_name': topic_name, 'topic_type': key[1], 'receiving': False}

    def topics(self) -> dict[str, Any]:
        with self._lock:
            items = [
                self._topic_state(key, item)
                for key, item in sorted(self._topics.items())
            ]
        return {'topics': items, 'meta': {'count': len(items)}}

    def topic_history(
        self,
        *,
        topic_name: str | None = None,
        topic_type: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        normalized_limit = _normalize_limit(limit or DEFAULT_TOPIC_HISTORY_LIMIT)
        with self._lock:
            if topic_name and topic_type:
                items = list(self._topics.get((topic_name, topic_type), {}).get('history', []))
            elif topic_name:
                items = [
                    event
                    for key, item in self._topics.items()
                    if key[0] == topic_name
                    for event in item.get('history', [])
                ]
            else:
                items = [
                    event
                    for item in self._topics.values()
                    for event in item.get('history', [])
                ]
        items.sort(key=lambda event: event.get('received_at') or 0, reverse=True)
        return {'history': items[:normalized_limit], 'meta': {'count': len(items[:normalized_limit])}}

    def reset_topic_history(
        self,
        *,
        topic_name: str | None = None,
        topic_type: str | None = None,
    ) -> dict[str, Any]:
        """Interface Lab에서 실행 이력을 반환하거나 관리하는 함수입니다."""
        cleared = 0
        with self._lock:
            if topic_name and topic_type:
                item = self._topics.get((topic_name, topic_type))
                if item is None:
                    return {'cleared': 0, 'topic_name': topic_name, 'topic_type': topic_type}
                cleared = len(item.get('history', []))
                item['history'] = []
                item['last_message'] = None
                item['last_received_at'] = None
                item['error'] = None
                item['message_count'] = 0
                return {'cleared': cleared, 'topic_name': topic_name, 'topic_type': topic_type}
            if topic_name:
                for key, item in self._topics.items():
                    if key[0] != topic_name:
                        continue
                    cleared += len(item.get('history', []))
                    item['history'] = []
                    item['last_message'] = None
                    item['last_received_at'] = None
                    item['error'] = None
                    item['message_count'] = 0
                return {'cleared': cleared, 'topic_name': topic_name, 'topic_type': None}

            for item in self._topics.values():
                cleared += len(item.get('history', []))
                item['history'] = []
                item['last_message'] = None
                item['last_received_at'] = None
                item['error'] = None
                item['message_count'] = 0
        return {'cleared': cleared, 'topic_name': None, 'topic_type': None}

    def publish_topic(
        self,
        *,
        topic_name: str,
        topic_type: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Interface Lab에서 Topic 메시지를 발행하는 함수입니다."""
        node = self._node_getter()
        if node is None:
            raise InterfaceReceiveError('ROS2 monitor node가 실행 중이 아닙니다.')
        topic_name = topic_name.strip()
        topic_type = topic_type.strip()
        if not topic_name.startswith('/'):
            raise InterfaceReceiveError('topic_name은 /로 시작해야 합니다.')
        self._ensure_registered_message(topic_type)
        started_at = time()
        graph_state = self._topic_graph_state(topic_name=topic_name, topic_type=topic_type)
        if _is_action_internal_topic(topic_name):
            result = {
                'success': False,
                'published': False,
                'sent_to_topic': False,
                'topic_name': topic_name,
                'topic_type': topic_type,
                'payload': payload,
                'published_at': started_at,
                'error_type': 'action_internal_topic',
                'error': (
                    f'{topic_name}은 ROS2 Action 내부 Topic이므로 '
                    'Interface Lab의 일반 Message Publish에서 사용할 수 없습니다.'
                ),
                'graph_state': graph_state,
                'qos': _qos_info(topic_type),
            }
            self._record_publish_history(result)
            return result
        if graph_state['conflicts']:
            conflict_types = ', '.join(
                sorted({str(item.get('type') or '') for item in graph_state['conflicts']})
            )
            result = {
                'success': False,
                'published': False,
                'sent_to_topic': False,
                'topic_name': topic_name,
                'topic_type': topic_type,
                'payload': payload,
                'published_at': started_at,
                'error_type': 'topic_type_conflict',
                'error': (
                    f'{topic_name}에는 다른 Message type({conflict_types})이 Graph에 있어 '
                    f'{topic_type} Publisher를 생성할 수 없습니다.'
                ),
                'graph_state': graph_state,
                'qos': _qos_info(topic_type),
            }
            self._record_publish_history(result)
            return result
        try:
            message_class = get_message(topic_type)
            try:
                message = build_ros_message(message_class, payload, label='message')
            except InterfaceValidationError as exc:
                result = {
                    'success': False,
                    'published': False,
                    'sent_to_topic': False,
                    'topic_name': topic_name,
                    'topic_type': topic_type,
                    'payload': payload,
                    'published_at': started_at,
                    'error_type': 'validation_error',
                    'error': str(exc),
                    'details': exc.details,
                    'graph_state': graph_state,
                    'qos': _qos_info(topic_type),
                }
                self._record_publish_history(result)
                return result
            publisher, created = self._publisher(topic_name, topic_type, message_class)
            if created:
                sleep(0.5)
                graph_state = self._topic_graph_state(topic_name=topic_name, topic_type=topic_type)
            publisher.publish(message)
            result = {
                'success': True,
                'published': True,
                'sent_to_topic': True,
                'topic_name': topic_name,
                'topic_type': topic_type,
                'payload': payload,
                'message_json': ros_message_to_json(message),
                'published_at': started_at,
                'subscriber_count': graph_state.get('subscriber_count', 0),
                'graph_state': graph_state,
                'qos': _qos_info(topic_type),
            }
        except Exception as exc:
            result = {
                'success': False,
                'published': False,
                'sent_to_topic': False,
                'topic_name': topic_name,
                'topic_type': topic_type,
                'payload': payload,
                'published_at': started_at,
                'error': str(exc),
                'graph_state': graph_state,
                'qos': _qos_info(topic_type),
            }
            self._record_publish_history(result)
            if isinstance(exc, InterfaceReceiveError):
                raise
            raise InterfaceReceiveError(str(exc)) from exc
        self._record_publish_history(result)
        return result

    def publish_history(self, *, limit: int | None = None) -> dict[str, Any]:
        """Interface Lab에서 실행 이력을 반환하거나 관리하는 함수입니다."""
        normalized_limit = _normalize_limit(limit or MAX_PUBLISH_HISTORY_ITEMS)
        with self._lock:
            items = [item.copy() for item in self._publish_history]
        return {'history': items[:normalized_limit], 'meta': {'count': len(items[:normalized_limit])}}

    def reset_publish_history(self, *, topic_name: str | None = None, topic_type: str | None = None) -> dict[str, Any]:
        """Interface Lab에서 실행 이력을 반환하거나 관리하는 함수입니다."""
        with self._lock:
            before = len(self._publish_history)
            if topic_name and topic_type:
                self._publish_history = [
                    item for item in self._publish_history
                    if not (item.get('topic_name') == topic_name and item.get('topic_type') == topic_type)
                ]
            elif topic_name:
                self._publish_history = [
                    item for item in self._publish_history
                    if item.get('topic_name') != topic_name
                ]
            else:
                self._publish_history = []
            cleared = before - len(self._publish_history)
        return {'cleared': cleared, 'topic_name': topic_name, 'topic_type': topic_type}

    def _record_topic_message(self, topic_name: str, topic_type: str, message: Any) -> None:
        received_at = time()
        try:
            message_json = ros_message_to_json(message)
            error = None
        except Exception as exc:
            message_json = None
            error = str(exc)
        preview = message_json if message_json is not None else {'error': error}
        key = (topic_name, topic_type)
        with self._lock:
            item = self._topics.get(key)
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

    def _registered_messages(self) -> list[dict[str, Any]]:
        registry = registry_snapshot()['interface_registry']
        messages = []
        for item in registry.get('messages', []):
            build = item.get('build') or {}
            package_name = build.get('interface_package')
            type_name = item.get('type_name')
            if not package_name or not type_name:
                continue
            message_type = f'{package_name}/msg/{type_name}'
            messages.append({
                'file_name': item.get('file_name'),
                'type_name': type_name,
                'message_type': message_type,
                'message_schema': item.get('parsed', []) if isinstance(item.get('parsed'), list) else [],
                'saved_path': build.get('saved_path'),
                'import_available': build.get('import_available') is True,
                'import_error': build.get('import_error'),
                'source': item.get('source', 'single_upload'),
                'package_name': package_name,
            })
        messages.extend(registered_package_messages())
        return messages

    def _registered_message(self, message_type: str) -> dict[str, Any] | None:
        for item in self._registered_messages():
            if item.get('message_type') == message_type:
                return item
        return None

    def _ensure_registered_message(self, message_type: str) -> None:
        entry = self._registered_message(message_type)
        if entry is None:
            raise InterfaceReceiveError('registry에 등록된 Message full_type만 사용할 수 있습니다.')
        if entry.get('import_available') is not True:
            raise InterfaceReceiveError(entry.get('import_error') or 'Message type import가 필요합니다.')

    def _publisher(self, topic_name: str, topic_type: str, message_class: type):
        key = (topic_name, topic_type)
        with self._lock:
            publisher = self._publishers.get(key)
            if publisher is not None:
                return publisher, False
            node = self._node_getter()
            if node is None:
                raise InterfaceReceiveError('ROS2 monitor node가 실행 중이 아닙니다.')
            publisher = node.create_publisher(message_class, topic_name, _default_qos(topic_type))
            self._publishers[key] = publisher
            return publisher, True

    def _record_publish_history(self, item: dict[str, Any]) -> None:
        with self._lock:
            self._publish_history.insert(0, item)
            del self._publish_history[MAX_PUBLISH_HISTORY_ITEMS:]

    def _topic_graph(self) -> list[dict[str, Any]]:
        node = self._node_getter()
        if node is None:
            return []
        graph = []
        try:
            names_and_types = node.get_topic_names_and_types()
        except Exception:
            return graph
        for name, types in names_and_types:
            for topic_type in sorted(set(types)):
                graph.append({
                    'name': name,
                    'type': topic_type,
                    'publisher_count': _safe_count(lambda: node.count_publishers(name)),
                    'subscriber_count': _safe_count(lambda: node.count_subscribers(name)),
                })
        return graph

    def _graph_topics_for_type(self, topic_type: str) -> list[dict[str, Any]]:
        return [item for item in self._topic_graph() if item.get('type') == topic_type]

    def _topic_graph_state(self, *, topic_name: str, topic_type: str) -> dict[str, Any]:
        same_name = [item for item in self._topic_graph() if item.get('name') == topic_name]
        exact = [item for item in same_name if item.get('type') == topic_type]
        conflicts = [item for item in same_name if item.get('type') != topic_type]
        return {
            'topic_name': topic_name,
            'topic_type': topic_type,
            'exists': bool(same_name),
            'type_matches': bool(exact) or not same_name,
            'exact_matches': exact,
            'conflicts': conflicts,
            'warning': (
                '같은 Topic 이름에 다른 type이 graph에 있습니다.'
                if conflicts else (
                    'Graph에 아직 같은 이름의 Topic이 없습니다.'
                    if not same_name else None
                )
            ),
            'publisher_count': max([int(item.get('publisher_count') or 0) for item in exact] or [0]),
            'subscriber_count': max([int(item.get('subscriber_count') or 0) for item in exact] or [0]),
        }

    @staticmethod
    def _topic_state(key: tuple[str, str], item: dict[str, Any]) -> dict[str, Any]:
        return {
            'topic_name': key[0],
            'topic_type': item.get('topic_type'),
            'full_type': item.get('topic_type'),
            'receiving': bool(item.get('receiving', item.get('subscription') is not None)),
            'history_limit': item.get('history_limit'),
            'message_count': item.get('message_count', 0),
            'last_message': item.get('last_message'),
            'last_received_at': item.get('last_received_at'),
            'error': item.get('error'),
            'started_at': item.get('started_at'),
            'qos': item.get('qos'),
            'graph_state': item.get('graph_state'),
        }


def _normalize_limit(value: int) -> int:
    try:
        limit = int(value)
    except (TypeError, ValueError):
        limit = DEFAULT_TOPIC_HISTORY_LIMIT
    return max(1, min(limit, MAX_TOPIC_HISTORY_LIMIT))


def _default_qos(topic_type: str) -> int:
    # Keep the current project level simple: depth 10 works for generated
    # custom messages and mirrors the previous InterfaceReceiveRuntime default.
    return 10


def _qos_info(topic_type: str) -> dict[str, Any]:
    sensor_like = topic_type.startswith('sensor_msgs/msg/')
    return {
        'depth': 10,
        'profile': 'sensor_data_hint' if sensor_like else 'default',
        'reliability': 'default',
        'durability': 'default',
    }


def _safe_count(callback: Callable[[], int]) -> int:
    try:
        return int(callback())
    except Exception:
        return 0


def _is_action_internal_topic(topic_name: str) -> bool:
    return '/_action/' in topic_name or topic_name.endswith('/_action')
