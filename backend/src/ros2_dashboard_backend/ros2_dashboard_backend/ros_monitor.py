"""ROS 2 graph monitoring utilities for the dashboard backend."""

from __future__ import annotations

from threading import Lock, Thread
from time import time
from typing import Any

import rclpy
from rclpy.node import Node

from ros2_dashboard_backend.action.alerts import build_action_alerts
from ros2_dashboard_backend.action.goal_runtime import ActionGoalRuntime
from ros2_dashboard_backend.action.runtime import ActionRuntime
from ros2_dashboard_backend.config_loader import MonitorConfig
from ros2_dashboard_backend.interface_receive_runtime import InterfaceReceiveRuntime
from ros2_dashboard_backend.node.alerts import build_node_alerts
from ros2_dashboard_backend.node.runtime import NodeRuntime
from ros2_dashboard_backend.service.alerts import build_service_alerts
from ros2_dashboard_backend.service.call_runtime import ServiceCallRuntime
from ros2_dashboard_backend.service.runtime import ServiceRuntime
from ros2_dashboard_backend.topic.alerts import build_alert_meta, build_alerts
from ros2_dashboard_backend.topic.runtime import TopicRuntime


class RosMonitor:
    """Coordinate ROS 2 graph runtimes and public monitor snapshots."""

    def __init__(self, config: MonitorConfig | None = None) -> None:
        """Initialize the monitor without starting ROS 2 resources."""
        self._config = config or MonitorConfig()
        self._node: Node | None = None
        self._thread: Thread | None = None
        self._lock = Lock()
        self._action_runtime = ActionRuntime(
            config=self._config,
            lock=self._lock,
            node_getter=lambda: self._node,
        )
        self._action_goal_runtime = ActionGoalRuntime(
            lock=self._lock,
            node_getter=lambda: self._node,
        )
        self._topic_runtime = TopicRuntime(
            action_monitor_subscriber_count=(
                self._action_runtime.monitor_subscriber_count
            ),
            config=self._config,
            lock=self._lock,
            node_getter=lambda: self._node,
        )
        self._node_runtime = NodeRuntime(
            exclude_names=self._config.nodes_exclude,
            exclude_prefixes=self._config.nodes_exclude_prefixes,
            include_names=self._config.nodes_include,
            lock=self._lock,
            node_getter=lambda: self._node,
            stale_timeout_sec=self._config.nodes_stale_timeout_sec,
        )
        self._service_runtime = ServiceRuntime(
            config=self._config,
            lock=self._lock,
            node_getter=lambda: self._node,
        )
        self._service_call_runtime = ServiceCallRuntime(
            lock=self._lock,
            node_getter=lambda: self._node,
        )
        self._receive_runtime = InterfaceReceiveRuntime(
            lock=self._lock,
            node_getter=lambda: self._node,
        )
        self._receive_service_reset_at: float | None = None
        self._receive_action_reset_at: float | None = None
        self._receive_service_reset_by_key: dict[tuple[str | None, str | None], float] = {}
        self._receive_action_reset_by_key: dict[tuple[str | None, str | None], float] = {}

    def start(self) -> None:
        """Start rclpy, create the monitor node, and spin in the background."""
        if self._thread and self._thread.is_alive():
            return

        rclpy.init(args=None)
        self._node = Node('ros2_dashboard_topic_monitor')
        self._node.create_timer(
            self._config.poll_interval_sec,
            self._update_graph,
        )
        self._update_graph()

        self._thread = Thread(target=self._spin, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Stop spinning and release ROS 2 resources."""
        node = self._node

        if rclpy.ok():
            rclpy.shutdown()

        if self._thread is not None:
            self._thread.join(timeout=2.0)

        if node is not None:
            node.destroy_node()

        self._thread = None
        self._node = None
        self._topic_runtime.clear()
        self._action_runtime.clear()
        self._action_goal_runtime.clear()
        self._service_runtime.clear()
        self._service_call_runtime.clear()
        self._receive_runtime.clear()
        self._receive_service_reset_at = None
        self._receive_action_reset_at = None
        self._receive_service_reset_by_key = {}
        self._receive_action_reset_by_key = {}
        self._node_runtime.clear()

    def snapshot(self) -> dict[str, Any]:
        """Return a thread-safe snapshot of the cached topic list."""
        return self._topic_runtime.snapshot()

    def service_snapshot(
        self,
        *,
        include_hidden: bool = False,
    ) -> dict[str, Any]:
        """Return a thread-safe snapshot of the cached service list."""
        snapshot = self._service_runtime.snapshot(
            include_hidden=include_hidden,
        )
        summaries = self._service_call_runtime.summary_by_service()
        callable_items = self._service_call_runtime.callable_services()['services']
        allowlisted_types = {item.get('service_type') for item in callable_items}
        callable_names = {
            (item.get('service_name'), item.get('service_type'))
            for item in callable_items
            if item.get('callable') is True
        }
        for service in snapshot['services']:
            key = (service.get('name'), service.get('type'))
            summary = summaries.get(key)
            allowlisted = service.get('type') in allowlisted_types
            service['allowlisted'] = allowlisted
            service['callable'] = key in callable_names
            if summary:
                service['last_call_summary'] = summary
            service['call_count'] = summary.get('call_count', 0) if summary else 0
            service['success_count'] = summary.get('success_count', 0) if summary else 0
            service['failure_count'] = summary.get('failure_count', 0) if summary else 0
        return snapshot

    def callable_services(self) -> dict[str, Any]:
        """Return registered services that can be explicitly called."""
        return self._service_call_runtime.callable_services()

    def call_service(
        self,
        *,
        service_name: str,
        service_type: str,
        request_data: dict[str, Any],
        timeout_sec: float | None = None,
    ) -> dict[str, Any]:
        """Run one explicit user-triggered service call."""
        return self._service_call_runtime.call_service(
            service_name=service_name,
            service_type=service_type,
            request_data=request_data,
            timeout_sec=timeout_sec,
        )

    def service_call_history(self) -> dict[str, Any]:
        """Return recent explicit service call history."""
        return self._service_call_runtime.history()

    def receive_service_history(self) -> dict[str, Any]:
        """Return receive-shaped service response history."""
        calls = self._service_call_runtime.history()['calls']
        events = []
        for index, call in enumerate(calls):
            called_at = call.get('called_at')
            if (
                self._receive_service_reset_at is not None
                and called_at is not None
                and called_at <= self._receive_service_reset_at
            ):
                continue
            reset_at = self._receive_service_reset_by_key.get(
                (call.get('service_name'), call.get('service_type')),
            )
            if reset_at is not None and called_at is not None and called_at <= reset_at:
                continue
            events.append({
                'id': f"service-{call.get('called_at', index)}-{index}",
                'direction': 'service_response',
                'service_name': call.get('service_name'),
                'service_type': call.get('service_type'),
                'request': call.get('request'),
                'response': call.get('response'),
                'status': 'success' if call.get('success') else call.get('error_type') or 'failed',
                'success': call.get('success') is True,
                'error_type': call.get('error_type'),
                'error': call.get('error'),
                'sent_to_server': call.get('sent_to_server', False),
                'called_at': call.get('called_at'),
                'received_at': call.get('called_at'),
                'response_time_ms': call.get('elapsed_ms'),
                'raw': call,
            })
        return {'history': events, 'meta': {'count': len(events)}}

    def reset_receive_service_history(
        self,
        *,
        service_name: str | None = None,
        service_type: str | None = None,
    ) -> dict[str, Any]:
        """Hide previous service receive-shaped history without clearing call history."""
        previous = len([
            item for item in self.receive_service_history()['history']
            if not service_name
            or (item.get('service_name') == service_name and item.get('service_type') == service_type)
        ])
        if service_name:
            self._receive_service_reset_by_key[(service_name, service_type)] = time()
        else:
            self._receive_service_reset_at = time()
        return {'cleared': previous}

    def action_snapshot(self) -> dict[str, Any]:
        """Return a thread-safe snapshot of the cached action list."""
        snapshot = self._action_runtime.snapshot()
        summaries = self._action_goal_runtime.summary_by_action()
        callable_items = self._action_goal_runtime.callable_actions()['actions']
        allowlisted_types = {item.get('action_type') for item in callable_items}
        callable_names = {
            (item.get('action_name'), item.get('action_type'))
            for item in callable_items
            if item.get('callable') is True
        }
        for action in snapshot['actions']:
            key = (action.get('name'), action.get('type'))
            summary = summaries.get(key)
            allowlisted = action.get('type') in allowlisted_types
            action['allowlisted'] = allowlisted
            action['callable'] = key in callable_names
            if summary:
                action['last_goal_summary'] = summary
            action['goal_count'] = summary.get('goal_count', 0) if summary else 0
            action['success_count'] = summary.get('success_count', 0) if summary else 0
            action['failure_count'] = summary.get('failure_count', 0) if summary else 0
            action['canceled_count'] = summary.get('canceled_count', 0) if summary else 0
        return snapshot

    def callable_actions(self) -> dict[str, Any]:
        """Return registered actions that can receive explicit goals."""
        return self._action_goal_runtime.callable_actions()

    def send_action_goal(
        self,
        *,
        action_name: str,
        action_type: str,
        goal_data: dict[str, Any],
        timeout_sec: float | None = None,
    ) -> dict[str, Any]:
        """Run one explicit user-triggered action goal."""
        return self._action_goal_runtime.send_goal(
            action_name=action_name,
            action_type=action_type,
            goal_data=goal_data,
            timeout_sec=timeout_sec,
        )

    def action_goal_history(self) -> dict[str, Any]:
        """Return recent explicit action goal history."""
        return self._action_goal_runtime.history()

    def receive_action_history(self) -> dict[str, Any]:
        """Return receive-shaped action feedback/result history."""
        goals = self._action_goal_runtime.history()['goals']
        events = []
        for goal_index, goal in enumerate(goals):
            sent_at = goal.get('sent_at')
            if (
                self._receive_action_reset_at is not None
                and sent_at is not None
                and sent_at <= self._receive_action_reset_at
            ):
                continue
            reset_at = self._receive_action_reset_by_key.get(
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

    def reset_receive_action_history(
        self,
        *,
        action_name: str | None = None,
        action_type: str | None = None,
    ) -> dict[str, Any]:
        """Hide previous action receive-shaped history without clearing goal history."""
        previous = len([
            item for item in self.receive_action_history()['history']
            if not action_name
            or (item.get('action_name') == action_name and item.get('action_type') == action_type)
        ])
        if action_name:
            self._receive_action_reset_by_key[(action_name, action_type)] = time()
        else:
            self._receive_action_reset_at = time()
        return {'cleared': previous}

    def start_receive_topic(self, *, topic_name: str, topic_type: str, history_limit: int = 100) -> dict[str, Any]:
        """Start explicit topic receive."""
        return self._receive_runtime.start_topic(
            topic_name=topic_name,
            topic_type=topic_type,
            history_limit=history_limit,
        )

    def stop_receive_topic(self, *, topic_name: str, topic_type: str | None = None) -> dict[str, Any]:
        """Stop explicit topic receive."""
        return self._receive_runtime.stop_topic(topic_name=topic_name, topic_type=topic_type)

    def receive_topics(self) -> dict[str, Any]:
        """Return receive topic states."""
        return self._receive_runtime.topics()

    def receive_topic_history(
        self,
        *,
        topic_name: str | None = None,
        topic_type: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        """Return explicit topic receive history."""
        return self._receive_runtime.topic_history(
            topic_name=topic_name,
            topic_type=topic_type,
            limit=limit,
        )

    def reset_receive_topic_history(
        self,
        *,
        topic_name: str | None = None,
        topic_type: str | None = None,
    ) -> dict[str, Any]:
        """Clear explicit topic receive history."""
        return self._receive_runtime.reset_topic_history(
            topic_name=topic_name,
            topic_type=topic_type,
        )

    def callable_messages(self) -> dict[str, Any]:
        """Return registered message types for explicit Topic work."""
        return self._receive_runtime.callable_messages()

    def message_schema(self, *, message_type: str) -> dict[str, Any]:
        """Return schema for one registered Message full_type."""
        return self._receive_runtime.message_schema(message_type=message_type)

    def publish_topic(
        self,
        *,
        topic_name: str,
        topic_type: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Publish one explicit user-triggered Topic message."""
        return self._receive_runtime.publish_topic(
            topic_name=topic_name,
            topic_type=topic_type,
            payload=payload,
        )

    def topic_publish_history(self, *, limit: int | None = None) -> dict[str, Any]:
        """Return explicit Topic publish history."""
        return self._receive_runtime.publish_history(limit=limit)

    def reset_topic_publish_history(
        self,
        *,
        topic_name: str | None = None,
        topic_type: str | None = None,
    ) -> dict[str, Any]:
        """Clear explicit Topic publish history."""
        return self._receive_runtime.reset_publish_history(
            topic_name=topic_name,
            topic_type=topic_type,
        )

    def node_snapshot(self) -> dict[str, Any]:
        """Return a thread-safe snapshot of the cached node list."""
        return self._node_runtime.snapshot()

    def websocket_snapshot(self) -> dict[str, Any]:
        """Return a lightweight monitor snapshot for WebSocket clients."""
        timestamp = time()
        topic_snapshot = self.snapshot()
        service_snapshot = self.service_snapshot()
        action_snapshot = self.action_snapshot()
        node_snapshot = self.node_snapshot()
        alerts = self.alerts()

        return {
            'type': 'monitor_snapshot',
            'timestamp': timestamp,
            'data': {
                'topics': self._websocket_topic_meta(
                    topic_snapshot['topics'],
                ),
                'services': self._websocket_service_meta(
                    service_snapshot['services'],
                    service_snapshot['meta'],
                ),
                'actions': self._websocket_action_meta(
                    action_snapshot['actions'],
                    action_snapshot['meta'],
                ),
                'nodes': self._websocket_node_meta(
                    node_snapshot['nodes'],
                    node_snapshot['meta'],
                ),
                'alerts': alerts['data'],
            },
        }

    def latest_message(self, name: str) -> dict[str, Any]:
        """Return the cached latest message preview for a topic."""
        return self._topic_runtime.latest_message(name)

    def topic_hz(self, name: str) -> dict[str, Any]:
        """Return the recent message frequency for a topic."""
        return self._topic_runtime.topic_hz(name)

    def alerts(self) -> dict[str, Any]:
        """Return current ROS 2 monitoring alerts."""
        detected_at = time()
        services = self._service_runtime.alert_snapshot()
        actions = self._action_runtime.snapshot()['actions']
        topics, subscriptions = self._topic_runtime.alert_snapshot()
        node_snapshot = self._node_runtime.snapshot()
        nodes = node_snapshot['nodes']

        alerts = build_alerts(
            topics=topics,
            subscriptions=subscriptions,
            detected_at=detected_at,
            stale_timeout_sec=self._config.stale_timeout_sec,
        )
        alerts.extend(
            build_service_alerts(
                services=services,
                detected_at=detected_at,
            ),
        )
        alerts.extend(
            build_action_alerts(
                actions=actions,
                detected_at=detected_at,
            ),
        )
        alerts.extend(
            build_node_alerts(
                nodes=nodes,
                detected_at=detected_at,
            ),
        )

        return {
            'success': True,
            'data': alerts,
            'meta': build_alert_meta(alerts),
            'message': 'ROS2 alerts fetched successfully',
        }

    @staticmethod
    def _websocket_topic_meta(
        topics: list[dict[str, Any]],
    ) -> dict[str, int]:
        return {
            'count': len(topics),
            'active_count': sum(
                1 for topic in topics
                if topic.get('status') == 'active'
            ),
            'warning_count': sum(
                1 for topic in topics
                if topic.get('status') in (
                    'warning',
                    'stale',
                    'no_subscriber',
                    'waiting_publisher',
                )
            ),
            'error_count': sum(
                1 for topic in topics
                if topic.get('status') in ('error', 'critical')
            ),
            'deep_monitoring_count': sum(
                1 for topic in topics
                if topic.get('deep_monitoring') is True
            ),
            'stale_count': sum(
                1 for topic in topics
                if topic.get('status') == 'stale'
            ),
        }

    @staticmethod
    def _websocket_service_meta(
        services: list[dict[str, Any]],
        meta: dict[str, Any],
    ) -> dict[str, int]:
        active_check_problem_count = sum(
            int(meta.get(key) or 0)
            for key in (
                'active_check_failed_count',
                'active_check_timeout_count',
                'active_check_error_count',
            )
        )
        return {
            'count': int(meta.get('count') or meta.get('visible_count') or 0),
            'active_count': int(meta.get('active_count') or 0),
            'warning_count': int(meta.get('warning_count') or 0),
            'error_count': int(meta.get('error_count') or 0),
            'active_check_supported_count': int(
                meta.get('active_check_supported_count') or 0,
            ),
            'active_check_problem_count': active_check_problem_count,
            'callable_count': sum(1 for service in services if service.get('callable') is True),
            'last_call_count': sum(1 for service in services if service.get('last_call_summary')),
        }

    @staticmethod
    def _websocket_action_meta(
        actions: list[dict[str, Any]],
        meta: dict[str, Any],
    ) -> dict[str, int]:
        return {
            'count': int(meta.get('count') or 0),
            'active_count': int(meta.get('active_count') or 0),
            'warning_count': int(meta.get('warning_count') or 0),
            'error_count': int(meta.get('error_count') or 0),
            'observed_goal_count': int(
                meta.get('observed_goal_count') or 0,
            ),
            'executing_count': sum(
                1 for action in actions
                if action.get('runtime', {}).get('last_goal_status')
                == 'executing'
            ),
            'failed_count': sum(
                1 for action in actions
                if action.get('runtime', {}).get('last_goal_status')
                == 'aborted'
            ),
            'callable_count': sum(1 for action in actions if action.get('callable') is True),
            'last_goal_count': sum(1 for action in actions if action.get('last_goal_summary')),
        }

    @staticmethod
    def _websocket_node_meta(
        nodes: list[dict[str, Any]],
        meta: dict[str, Any],
    ) -> dict[str, int]:
        return {
            'count': int(meta.get('count') or len(nodes)),
            'active_count': int(meta.get('active_count') or 0),
            'warning_count': int(meta.get('warning_count') or 0),
            'error_count': int(meta.get('error_count') or 0),
            'stale_count': sum(
                1 for node in nodes
                if node.get('status') == 'stale'
            ),
        }

    def _spin(self) -> None:
        if self._node is None:
            return

        try:
            rclpy.spin(self._node)
        except rclpy.executors.ExternalShutdownException:
            pass
        except Exception:
            if rclpy.ok():
                raise

    def _update_graph(self) -> None:
        self._node_runtime.update()
        self._topic_runtime.update()
        services = self._service_runtime.update()
        self._action_runtime.update()
        self._service_runtime.update_active_checks(services)
