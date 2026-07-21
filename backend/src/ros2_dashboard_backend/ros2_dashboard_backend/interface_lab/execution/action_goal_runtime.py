"""Explicit user-triggered action goal runtime for registered interfaces."""

from __future__ import annotations

import threading
from time import time
from typing import Any, Callable

from rclpy.action import ActionClient
from rclpy.action.graph import (
    get_action_client_names_and_types_by_node,
    get_action_names_and_types,
    get_action_server_names_and_types_by_node,
)
from rosidl_runtime_py.utilities import get_action

from ros2_dashboard_backend.interface_lab.apply.runtime import refresh_install_python_paths
from ros2_dashboard_backend.interface_lab.common.value_converter import (
    InterfaceValidationError,
    build_ros_message,
    ros_message_to_json,
    schema_from_message_class,
)
from ros2_dashboard_backend.interface_lab.management.registry import registry_snapshot
from ros2_dashboard_backend.interface_lab.management.packages import registered_package_actions


MAX_HISTORY_ITEMS = 30
DEFAULT_TIMEOUT_SEC = 10.0
MAX_TIMEOUT_SEC = 60.0


class ActionGoalError(ValueError):
    """Raised when an explicit action goal request is not allowed or failed."""


class ActionGoalRuntime:
    """Run explicit user-triggered action goals for registered .action types."""

    def __init__(
        self,
        *,
        lock: Any,
        node_getter: Callable[[], Any],
    ) -> None:
        self._lock = lock
        self._node_getter = node_getter
        self._clients: dict[tuple[str, str], ActionClient] = {}
        self._history: list[dict[str, Any]] = []
        self._receive_reset_at: float | None = None
        self._receive_reset_by_key: dict[tuple[str | None, str | None], float] = {}

    def clear(self) -> None:
        """Clear cached clients and goal history."""
        with self._lock:
            self._clients = {}
            self._history = []
            self._receive_reset_at = None
            self._receive_reset_by_key = {}

    def callable_actions(self) -> dict[str, Any]:
        """Return registered actions with explicit goal eligibility state."""
        refresh_install_python_paths()
        registered = self._registered_actions()
        graph = self._action_graph()
        actions: list[dict[str, Any]] = []

        for entry in registered:
            action_type = entry['action_type']
            matching = [
                item for item in graph
                if item['type'] == action_type
            ]
            if not matching:
                actions.append(self._action_state(entry, None))
                continue
            for graph_item in matching:
                actions.append(self._action_state(entry, graph_item))

        actions.sort(key=lambda item: (item['action_type'], item['action_name']))
        return {
            'actions': actions,
            'meta': {
                'count': len(actions),
                'registered_count': len(registered),
                'callable_count': sum(1 for item in actions if item['callable']),
            },
        }

    def send_goal(
        self,
        *,
        action_name: str,
        action_type: str,
        goal_data: dict[str, Any],
        timeout_sec: float | None = None,
    ) -> dict[str, Any]:
        """Send one registered action goal and wait for feedback/result."""
        timeout = _normalized_timeout(timeout_sec)
        refresh_install_python_paths()
        allowed = self._allowed_action(action_name, action_type)
        if allowed is None:
            raise ActionGoalError(
                'registry에 등록되고 import 가능한 Action이며, 현재 server가 있는 경우만 실행할 수 있습니다.',
            )

        node = self._node_getter()
        if node is None:
            raise ActionGoalError('ROS2 monitor node가 실행 중이 아닙니다.')

        started_at = time()
        feedback_items: list[dict[str, Any]] = []
        sent_to_server = False
        try:
            action_class = get_action(action_type)
            try:
                goal = build_ros_message(action_class.Goal, goal_data, label='goal')
            except InterfaceValidationError as exc:
                result = self._result(
                    success=False,
                    action_name=action_name,
                    action_type=action_type,
                    goal_data=goal_data,
                    accepted=False,
                    feedback=feedback_items,
                    result=None,
                    started_at=started_at,
                    timeout_sec=timeout,
                    error=str(exc),
                    error_type='validation_error',
                    details=exc.details,
                    sent_to_server=False,
                )
                self._record_history(result)
                return result
            client = self._client(action_name, action_type, action_class)
            if not client.server_is_ready():
                raise ActionGoalError('Action server가 준비되지 않았습니다.')

            send_event = threading.Event()
            send_future = client.send_goal_async(
                goal,
                feedback_callback=lambda feedback: feedback_items.append(
                    ros_message_to_json(feedback.feedback),
                ),
            )
            sent_to_server = True
            send_future.add_done_callback(lambda _future: send_event.set())
            if not send_event.wait(timeout=timeout):
                raise TimeoutError(f'action goal accept timeout after {timeout:.2f}s')

            goal_handle = send_future.result()
            accepted = bool(getattr(goal_handle, 'accepted', False))
            if not accepted:
                result = self._result(
                    success=False,
                    action_name=action_name,
                    action_type=action_type,
                    goal_data=goal_data,
                    accepted=False,
                    feedback=feedback_items,
                    result=None,
                    started_at=started_at,
                    timeout_sec=timeout,
                    error='goal rejected',
                    sent_to_server=sent_to_server,
                )
                self._record_history(result)
                return result

            result_event = threading.Event()
            result_future = goal_handle.get_result_async()
            result_future.add_done_callback(lambda _future: result_event.set())
            remaining = max(0.0, timeout - (time() - started_at))
            if not result_event.wait(timeout=remaining):
                raise TimeoutError(f'action result timeout after {timeout:.2f}s')

            result_response = result_future.result()
            result_msg = getattr(result_response, 'result', result_response)
            status = getattr(result_response, 'status', None)
            result = self._result(
                success=True,
                action_name=action_name,
                action_type=action_type,
                goal_data=goal_data,
                accepted=True,
                feedback=feedback_items,
                result=ros_message_to_json(result_msg),
                started_at=started_at,
                timeout_sec=timeout,
                status=status,
                sent_to_server=sent_to_server,
            )
        except Exception as exc:
            result = self._result(
                success=False,
                action_name=action_name,
                action_type=action_type,
                goal_data=goal_data,
                accepted=False,
                feedback=feedback_items,
                result=None,
                started_at=started_at,
                timeout_sec=timeout,
                error=str(exc),
                sent_to_server=sent_to_server,
            )
            self._record_history(result)
            if isinstance(exc, ActionGoalError):
                raise
            raise ActionGoalError(str(exc)) from exc

        self._record_history(result)
        return result

    def history(self) -> dict[str, Any]:
        """Return recent explicit action goal history."""
        with self._lock:
            goals = [item.copy() for item in self._history]
        return {
            'goals': goals,
            'meta': {
                'count': len(goals),
            },
        }

    def receive_history(self) -> dict[str, Any]:
        """Return action goal feedback/result history in the receive format."""
        goals = self.history()['goals']
        events = []
        for goal_index, goal in enumerate(goals):
            sent_at = goal.get('sent_at')
            if (
                self._receive_reset_at is not None
                and sent_at is not None
                and sent_at <= self._receive_reset_at
            ):
                continue
            reset_at = self._receive_reset_by_key.get(
                (goal.get('action_name'), goal.get('action_type')),
            )
            if reset_at is not None and sent_at is not None and sent_at <= reset_at:
                continue
            feedback_items = goal.get('feedback') if isinstance(goal.get('feedback'), list) else []
            for feedback_index, feedback in enumerate(feedback_items):
                events.append({
                    'id': f"action-feedback-{goal.get('sent_at', goal_index)}-{feedback_index}",
                    'direction': 'action_feedback',
                    'action_name': goal.get('action_name'),
                    'action_type': goal.get('action_type'),
                    'goal': goal.get('goal'),
                    'feedback': feedback,
                    'result': None,
                    'status': 'feedback',
                    'success': goal.get('success') is True,
                    'error_type': goal.get('error_type'),
                    'error': goal.get('error'),
                    'sent_to_server': goal.get('sent_to_server', False),
                    'goal_sent_at': goal.get('sent_at'),
                    'received_at': goal.get('sent_at'),
                    'execution_time_ms': goal.get('elapsed_ms'),
                    'raw': goal,
                })
            events.append({
                'id': f"action-result-{goal.get('sent_at', goal_index)}-{goal_index}",
                'direction': 'action_result',
                'action_name': goal.get('action_name'),
                'action_type': goal.get('action_type'),
                'goal': goal.get('goal'),
                'feedback': None,
                'result': goal.get('result'),
                'status': 'success' if goal.get('success') else goal.get('error_type') or goal.get('status') or 'failed',
                'success': goal.get('success') is True,
                'error_type': goal.get('error_type'),
                'error': goal.get('error'),
                'sent_to_server': goal.get('sent_to_server', False),
                'goal_sent_at': goal.get('sent_at'),
                'received_at': goal.get('sent_at'),
                'execution_time_ms': goal.get('elapsed_ms'),
                'raw': goal,
            })
        return {'history': events, 'meta': {'count': len(events)}}

    def reset_receive_history(
        self,
        *,
        action_name: str | None = None,
        action_type: str | None = None,
    ) -> dict[str, Any]:
        """Hide previous receive-shaped history without clearing goal history."""
        previous = len([
            item for item in self.receive_history()['history']
            if not action_name
            or (item.get('action_name') == action_name and item.get('action_type') == action_type)
        ])
        if action_name:
            self._receive_reset_by_key[(action_name, action_type)] = time()
        else:
            self._receive_reset_at = time()
        return {'cleared': previous}

    def summary_by_action(self) -> dict[tuple[str, str], dict[str, Any]]:
        """Return last goal and counters keyed by (action_name, action_type)."""
        with self._lock:
            goals = [item.copy() for item in self._history]
        summaries: dict[tuple[str, str], dict[str, Any]] = {}
        for goal in reversed(goals):
            key = (str(goal.get('action_name') or ''), str(goal.get('action_type') or ''))
            if not key[0] or not key[1]:
                continue
            summary = summaries.setdefault(key, {
                'goal_count': 0,
                'success_count': 0,
                'failure_count': 0,
                'canceled_count': 0,
                'history': [],
            })
            summary['goal_count'] += 1
            if goal.get('success') is True:
                summary['success_count'] += 1
            else:
                summary['failure_count'] += 1
            if str(goal.get('status')).lower() == 'canceled':
                summary['canceled_count'] += 1
            summary['history'].insert(0, _goal_summary(goal))
            summary['history'] = summary['history'][:5]
            summary.update(_goal_summary(goal))
        return summaries

    def _allowed_action(
        self,
        action_name: str,
        action_type: str,
    ) -> dict[str, Any] | None:
        registered = self._registered_actions()
        if not any(
            item['action_type'] == action_type
            and item['import_available'] is True
            for item in registered
        ):
            return None

        for item in self._action_graph():
            if (
                item['name'] == action_name
                and item['type'] == action_type
                and item['server_count'] > 0
            ):
                return item
        return None

    def _registered_actions(self) -> list[dict[str, Any]]:
        registry = registry_snapshot()['interface_registry']
        actions = []
        for item in registry.get('actions', []):
            build = item.get('build') or {}
            package_name = build.get('interface_package')
            type_name = item.get('type_name')
            if not package_name or not type_name:
                continue
            action_type = f'{package_name}/action/{type_name}'
            goal_schema = item.get('parsed', {}).get('goal', [])
            result_schema = item.get('parsed', {}).get('result', [])
            feedback_schema = item.get('parsed', {}).get('feedback', [])
            if build.get('import_available') is True and not goal_schema:
                goal_schema, result_schema, feedback_schema = _schema_from_action_class(action_type)
            actions.append({
                'file_name': item.get('file_name'),
                'type_name': type_name,
                'action_type': action_type,
                'goal_schema': goal_schema,
                'result_schema': result_schema,
                'feedback_schema': feedback_schema,
                'saved_path': build.get('saved_path'),
                'import_available': build.get('import_available') is True,
                'import_error': build.get('import_error'),
                'source': item.get('source', 'single_upload'),
                'package_name': package_name,
            })
        actions.extend(registered_package_actions())
        return actions

    def _action_graph(self) -> list[dict[str, Any]]:
        node = self._node_getter()
        if node is None:
            return []
        try:
            names_and_types = get_action_names_and_types(node)
        except Exception:
            return []
        server_counts, client_counts = self._action_count_maps()
        graph = []
        for name, types in names_and_types:
            for action_type in sorted(set(types)):
                graph.append({
                    'name': name,
                    'type': action_type,
                    'server_count': server_counts.get((name, action_type), 0),
                    'client_count': client_counts.get((name, action_type), 0),
                })
        return graph

    def _action_count_maps(
        self,
    ) -> tuple[dict[tuple[str, str], int], dict[tuple[str, str], int]]:
        node = self._node_getter()
        if node is None:
            return {}, {}
        server_counts: dict[tuple[str, str], int] = {}
        client_counts: dict[tuple[str, str], int] = {}
        try:
            node_names = node.get_node_names_and_namespaces()
        except Exception:
            return server_counts, client_counts
        for node_name, namespace in node_names:
            self._merge_action_counts(
                server_counts,
                self._action_servers_by_node(node_name, namespace),
            )
            self._merge_action_counts(
                client_counts,
                self._action_clients_by_node(node_name, namespace),
            )
        return server_counts, client_counts

    def _action_servers_by_node(
        self,
        node_name: str,
        namespace: str,
    ) -> list[tuple[str, list[str]]]:
        node = self._node_getter()
        if node is None:
            return []
        try:
            return get_action_server_names_and_types_by_node(
                node,
                node_name,
                namespace,
            )
        except Exception:
            return []

    def _action_clients_by_node(
        self,
        node_name: str,
        namespace: str,
    ) -> list[tuple[str, list[str]]]:
        node = self._node_getter()
        if node is None:
            return []
        try:
            return get_action_client_names_and_types_by_node(
                node,
                node_name,
                namespace,
            )
        except Exception:
            return []

    def _client(self, name: str, action_type: str, action_class: type):
        key = (name, action_type)
        with self._lock:
            client = self._clients.get(key)
            if client is not None:
                return client

            node = self._node_getter()
            if node is None:
                raise ActionGoalError('ROS2 monitor node가 실행 중이 아닙니다.')

            client = ActionClient(node, action_class, name)
            self._clients[key] = client
            return client

    def _action_state(
        self,
        entry: dict[str, Any],
        graph_item: dict[str, Any] | None,
    ) -> dict[str, Any]:
        server_count = int(graph_item.get('server_count') or 0) if graph_item else 0
        server_available = server_count > 0
        import_available = entry['import_available'] is True
        callable_now = import_available and server_available
        reason = None
        if not import_available:
            reason = entry.get('import_error') or 'import 불가'
        elif not server_available:
            reason = '서버 없음'
        return {
            'action_name': graph_item['name'] if graph_item else '',
            'action_type': entry['action_type'],
            'full_type': entry['action_type'],
            'graph_type': graph_item['type'] if graph_item else None,
            'selected_import_type': entry['action_type'],
            'file_name': entry['file_name'],
            'type_name': entry['type_name'],
            'goal_schema': entry['goal_schema'],
            'result_schema': entry['result_schema'],
            'feedback_schema': entry['feedback_schema'],
            'import_available': import_available,
            'import_error': entry.get('import_error'),
            'server_available': server_available,
            'server_count': server_count,
            'client_count': int(graph_item.get('client_count') or 0) if graph_item else 0,
            'callable': callable_now,
            'executable': callable_now,
            'reason': reason,
            'saved_path': entry.get('saved_path'),
            'source': entry.get('source', 'single_interface'),
            'package_name': entry.get('package_name'),
        }

    @staticmethod
    def _merge_action_counts(
        counts: dict[tuple[str, str], int],
        names_and_types: list[tuple[str, list[str]]],
    ) -> None:
        for name, types in names_and_types:
            for action_type in set(types):
                key = (name, action_type)
                counts[key] = counts.get(key, 0) + 1

    def _record_history(self, item: dict[str, Any]) -> None:
        with self._lock:
            self._history.insert(0, item)
            del self._history[MAX_HISTORY_ITEMS:]

    @staticmethod
    def _result(
        *,
        success: bool,
        action_name: str,
        action_type: str,
        goal_data: dict[str, Any],
        accepted: bool,
        feedback: list[dict[str, Any]],
        result: dict[str, Any] | None,
        started_at: float,
        timeout_sec: float,
        status: int | None = None,
        error: str | None = None,
        error_type: str | None = None,
        details: list[str] | None = None,
        sent_to_server: bool = False,
    ) -> dict[str, Any]:
        payload = {
            'success': success,
            'action_name': action_name,
            'action_type': action_type,
            'goal': goal_data,
            'accepted': accepted,
            'elapsed_ms': (time() - started_at) * 1000.0,
            'feedback': feedback,
            'result': result,
            'timeout_sec': timeout_sec,
            'sent_at': started_at,
            'sent_to_server': sent_to_server,
        }
        if status is not None:
            payload['status'] = status
        if error is not None:
            payload['error'] = error
        if error_type is not None:
            payload['error_type'] = error_type
        if details is not None:
            payload['details'] = details
        return payload


def _normalized_timeout(timeout_sec: float | None) -> float:
    if timeout_sec is None:
        return DEFAULT_TIMEOUT_SEC
    try:
        timeout = float(timeout_sec)
    except (TypeError, ValueError) as exc:
        raise ActionGoalError('timeout_sec 값이 올바르지 않습니다.') from exc
    if timeout <= 0:
        raise ActionGoalError('timeout_sec는 0보다 커야 합니다.')
    return min(timeout, MAX_TIMEOUT_SEC)


def _schema_from_action_class(action_type: str) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    try:
        action_class = get_action(action_type)
        return (
            _schema_from_message_class(action_class.Goal),
            _schema_from_message_class(action_class.Result),
            _schema_from_message_class(action_class.Feedback),
        )
    except Exception:
        return [], [], []


def _goal_summary(goal: dict[str, Any]) -> dict[str, Any]:
    error_type = goal.get('error_type')
    status = (
        'success'
        if goal.get('success') is True
        else error_type or goal.get('status') or 'failed'
    )
    feedback = goal.get('feedback') if isinstance(goal.get('feedback'), list) else []
    return {
        'status': status,
        'success': goal.get('success') is True,
        'accepted': goal.get('accepted') is True,
        'sent_to_server': goal.get('sent_to_server', False),
        'last_goal_preview': goal.get('goal'),
        'last_goal_sent_at': goal.get('sent_at'),
        'last_feedback_preview': feedback[-1] if feedback else None,
        'last_feedback_at': goal.get('sent_at') if feedback else None,
        'last_result_preview': goal.get('result'),
        'last_result_at': goal.get('sent_at') if goal.get('result') is not None else None,
        'last_goal_status': status,
        'execution_time_ms': goal.get('elapsed_ms'),
        'last_error': goal.get('error'),
        'error_type': error_type,
        'details': goal.get('details', []),
    }
