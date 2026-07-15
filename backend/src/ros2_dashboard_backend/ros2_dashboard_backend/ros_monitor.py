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
        return self._service_runtime.snapshot(
            include_hidden=include_hidden,
        )

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

    def action_snapshot(self) -> dict[str, Any]:
        """Return a thread-safe snapshot of the cached action list."""
        return self._action_runtime.snapshot()

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
    def _websocket_service_meta(meta: dict[str, Any]) -> dict[str, int]:
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
