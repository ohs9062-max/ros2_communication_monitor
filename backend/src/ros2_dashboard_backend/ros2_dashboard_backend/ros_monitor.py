"""ROS 2 graph monitoring utilities for the dashboard backend."""

from __future__ import annotations

import logging
from threading import Lock, Thread
from time import time
from typing import Any

import rclpy
from rclpy.action.graph import (
    get_action_client_names_and_types_by_node,
    get_action_names_and_types,
    get_action_server_names_and_types_by_node,
)
from rclpy.node import Node
from rclpy.qos import QoSProfile

from ros2_dashboard_backend.action.alerts import build_action_alerts
from ros2_dashboard_backend.action.discovery import build_action_item
from ros2_dashboard_backend.action.filters import is_action_included
from ros2_dashboard_backend.action.models import action_meta
from ros2_dashboard_backend.action.result_runtime import ActionResultRuntime
from ros2_dashboard_backend.action.subscriptions import (
    action_entry_matches,
    build_action_subscription_entry,
    load_feedback_message_class,
    load_status_message_class,
    runtime_snapshot,
    update_feedback_runtime,
    update_status_runtime,
)
from ros2_dashboard_backend.config_loader import MonitorConfig
from ros2_dashboard_backend.node.alerts import build_node_alerts
from ros2_dashboard_backend.node.runtime import NodeRuntime
from ros2_dashboard_backend.service.active_check_runtime import (
    ServiceActiveCheckRuntime,
)
from ros2_dashboard_backend.service.alerts import build_service_alerts
from ros2_dashboard_backend.service.discovery import build_service_item
from ros2_dashboard_backend.service.filters import (
    is_service_included,
    is_supported_type as is_supported_service_type,
)
from ros2_dashboard_backend.service.models import service_meta
from ros2_dashboard_backend.topic.alerts import build_alert_meta, build_alerts
from ros2_dashboard_backend.topic.runtime import TopicRuntime


LOGGER = logging.getLogger(__name__)


class TopicMonitor:
    """Collect topic metadata from the ROS 2 graph on a fixed interval."""

    def __init__(self, config: MonitorConfig | None = None) -> None:
        """Initialize the monitor without starting ROS 2 resources."""
        self._config = config or MonitorConfig()
        self._node: Node | None = None
        self._thread: Thread | None = None
        self._lock = Lock()
        self._services: list[dict[str, Any]] = []
        self._actions: list[dict[str, Any]] = []
        self._services_last_updated = 0.0
        self._actions_last_updated = 0.0
        self._action_subscriptions: dict[str, dict[str, Any]] = {}
        self._topic_runtime = TopicRuntime(
            action_monitor_subscriber_count=(
                self._action_monitor_subscriber_count
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
        self._service_active_checks = ServiceActiveCheckRuntime(
            active_check_config=self._config.services_active_check,
            lock=self._lock,
            node_getter=lambda: self._node,
        )
        self._action_results = ActionResultRuntime(
            action_subscriptions=self._action_subscriptions,
            auto_fetch_result_for_observed_goals=(
                self._config.actions_auto_fetch_result_for_observed_goals
            ),
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
        with self._lock:
            self._action_subscriptions = {}
            self._action_results.bind_action_subscriptions(
                self._action_subscriptions,
            )
        self._topic_runtime.clear()
        self._action_results.clear()
        self._service_active_checks.clear()
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
        with self._lock:
            all_services = [service.copy() for service in self._services]
            last_updated = self._services_last_updated

        if include_hidden:
            services = all_services
        else:
            services = [
                service for service in all_services
                if service.get('hidden_by_default') is not True
            ]

        return {
            'services': services,
            'meta': service_meta(
                services=services,
                all_services=all_services,
                last_updated=last_updated,
            ),
        }

    def action_snapshot(self) -> dict[str, Any]:
        """Return a thread-safe snapshot of the cached action list."""
        with self._lock:
            actions = [action.copy() for action in self._actions]
            last_updated = self._actions_last_updated

        return {
            'actions': actions,
            'meta': action_meta(
                actions=actions,
                last_updated=last_updated,
            ),
        }

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
        with self._lock:
            services = [service.copy() for service in self._services]
            actions = [action.copy() for action in self._actions]
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
        services = self._update_services()
        actions = self._update_actions()
        self._action_results.update(actions)
        self._service_active_checks.update(services)

    def _update_services(self) -> list[dict[str, Any]]:
        if self._node is None:
            return []

        services = []
        updated_at = time()
        active_check_cache = self._service_active_checks.cache_snapshot()

        for name, types in self._node.get_service_names_and_types():
            if not is_service_included(
                name,
                include_names=self._config.services_include,
                exclude_names=self._config.services_exclude,
            ):
                continue

            service_type = types[0] if types else None
            services.append(
                build_service_item(
                    name=name,
                    service_type=service_type,
                    server_count=self._node.count_services(name),
                    client_count=self._service_client_count(name),
                    supported_type=is_supported_service_type(service_type),
                    updated_at=updated_at,
                    active_check_config=(
                        self._config.services_active_check
                    ),
                    active_check_allowlist=(
                        self._service_active_checks.allowlist
                    ),
                    active_check_cache=active_check_cache,
                ),
            )

        services.sort(key=lambda service: service['name'])

        with self._lock:
            self._services = services
            self._services_last_updated = updated_at

        return services

    def _update_actions(self) -> list[dict[str, Any]]:
        if self._node is None:
            return []

        actions = []
        updated_at = time()
        action_names_and_types = self._action_names_and_types()
        server_counts, client_counts = self._action_count_maps()

        for name, types in action_names_and_types:
            if not is_action_included(
                name,
                include_names=self._config.actions_include,
                exclude_names=self._config.actions_exclude,
                exclude_prefixes=self._config.actions_exclude_prefixes,
            ):
                continue

            action_type = types[0] if types else None
            capabilities = (
                self._ensure_action_subscriptions(
                    name=name,
                    action_type=action_type,
                )
            )
            runtime = self._action_runtime(name)
            actions.append(
                build_action_item(
                    name=name,
                    action_type=action_type,
                    server_count=server_counts.get(name, 0),
                    client_count=client_counts.get(name, 0),
                    updated_at=updated_at,
                    status_supported=capabilities['status_supported'],
                    feedback_supported=capabilities['feedback_supported'],
                    feedback_reason=capabilities['feedback_reason'],
                    result_supported=capabilities['result_supported'],
                    result_policy=capabilities['result_policy'],
                    result_reason=capabilities['result_reason'],
                    runtime=runtime,
                ),
            )

        actions.sort(key=lambda action: action['name'])

        with self._lock:
            self._actions = actions
            self._actions_last_updated = updated_at

        self._cleanup_disappeared_action_subscriptions(
            {action['name'] for action in actions},
        )

        return actions

    def _action_names_and_types(self) -> list[tuple[str, list[str]]]:
        if self._node is None:
            return []

        try:
            return get_action_names_and_types(self._node)
        except Exception as exc:  # pragma: no cover
            LOGGER.warning('Failed to read action graph: %s', exc)
            return []

    def _action_count_maps(self) -> tuple[dict[str, int], dict[str, int]]:
        if self._node is None:
            return {}, {}

        server_counts: dict[str, int] = {}
        client_counts: dict[str, int] = {}
        try:
            node_names = self._node.get_node_names_and_namespaces()
        except Exception as exc:  # pragma: no cover
            LOGGER.warning('Failed to read ROS2 node graph: %s', exc)
            return server_counts, client_counts

        for node_name, namespace in node_names:
            self._merge_action_counts(
                counts=server_counts,
                names_and_types=self._action_servers_by_node(
                    node_name,
                    namespace,
                ),
            )
            self._merge_action_counts(
                counts=client_counts,
                names_and_types=self._action_clients_by_node(
                    node_name,
                    namespace,
                ),
            )

        return server_counts, client_counts

    def _action_servers_by_node(
        self,
        node_name: str,
        namespace: str,
    ) -> list[tuple[str, list[str]]]:
        if self._node is None:
            return []

        try:
            return get_action_server_names_and_types_by_node(
                self._node,
                node_name,
                namespace,
            )
        except Exception as exc:  # pragma: no cover
            LOGGER.debug(
                'Failed to read action servers for %s%s: %s',
                namespace,
                node_name,
                exc,
            )
            return []

    def _action_clients_by_node(
        self,
        node_name: str,
        namespace: str,
    ) -> list[tuple[str, list[str]]]:
        if self._node is None:
            return []

        try:
            return get_action_client_names_and_types_by_node(
                self._node,
                node_name,
                namespace,
            )
        except Exception as exc:  # pragma: no cover
            LOGGER.debug(
                'Failed to read action clients for %s%s: %s',
                namespace,
                node_name,
                exc,
            )
            return []

    @staticmethod
    def _merge_action_counts(
        *,
        counts: dict[str, int],
        names_and_types: list[tuple[str, list[str]]],
    ) -> None:
        for name, _types in names_and_types:
            counts[name] = counts.get(name, 0) + 1

    def _ensure_action_subscriptions(
        self,
        *,
        name: str,
        action_type: str | None,
    ) -> dict[str, Any]:
        if self._node is None:
            return self._action_capabilities(None)

        with self._lock:
            entry = self._action_subscriptions.get(name)
            if action_entry_matches(entry, action_type=action_type):
                return self._action_capabilities(entry)

            if entry is not None:
                self._destroy_action_entry_subscriptions(entry)

            entry = build_action_subscription_entry(
                action_type=action_type,
            )
            self._action_subscriptions[name] = entry

        status_supported = self._maybe_create_action_status_subscription(
            name,
            entry,
        )
        feedback_supported = self._maybe_create_action_feedback_subscription(
            name,
            action_type,
            entry,
        )
        result_supported, result_policy, result_reason = (
            self._action_results.support(action_type)
        )

        with self._lock:
            current = self._action_subscriptions.get(name)
            if current is entry:
                current['status_supported'] = status_supported
                current['feedback_supported'] = feedback_supported
                current['result_supported'] = result_supported
                current['result_policy'] = result_policy
                current['result_reason'] = result_reason

        return self._action_capabilities(entry)

    @staticmethod
    def _action_capabilities(entry: dict[str, Any] | None) -> dict[str, Any]:
        if entry is None:
            return {
                'status_supported': False,
                'feedback_supported': False,
                'feedback_reason': 'action monitor is not running',
                'result_supported': False,
                'result_policy': None,
                'result_reason': 'action monitor is not running',
            }

        return {
            'status_supported': bool(entry.get('status_supported')),
            'feedback_supported': bool(entry.get('feedback_supported')),
            'feedback_reason': entry.get('feedback_reason'),
            'result_supported': bool(entry.get('result_supported')),
            'result_policy': entry.get('result_policy'),
            'result_reason': entry.get('result_reason'),
        }

    def _maybe_create_action_status_subscription(
        self,
        name: str,
        entry: dict[str, Any],
    ) -> bool:
        if self._node is None:
            return False

        if not self._config.actions_auto_monitor_status:
            return False

        message_class = load_status_message_class()
        if message_class is None:
            return False

        try:
            subscription = self._node.create_subscription(
                message_class,
                f'{name}/_action/status',
                self._action_status_callback(name),
                QoSProfile(depth=10),
            )
        except Exception as exc:  # pragma: no cover
            LOGGER.warning(
                'Failed to subscribe action status topic %s: %s',
                name,
                exc,
            )
            return False

        entry['status_subscription'] = subscription
        return True

    def _maybe_create_action_feedback_subscription(
        self,
        name: str,
        action_type: str | None,
        entry: dict[str, Any],
    ) -> bool:
        if self._node is None:
            return False

        if not self._config.actions_auto_monitor_feedback:
            entry['feedback_reason'] = 'feedback monitoring disabled'
            return False

        message_class = load_feedback_message_class(action_type)
        if message_class is None:
            entry['feedback_reason'] = (
                'failed to import feedback message class'
            )
            return False

        try:
            subscription = self._node.create_subscription(
                message_class,
                f'{name}/_action/feedback',
                self._action_feedback_callback(name),
                QoSProfile(depth=10),
            )
        except Exception as exc:  # pragma: no cover
            LOGGER.warning(
                'Failed to subscribe action feedback topic %s: %s',
                name,
                exc,
            )
            return False

        entry['feedback_subscription'] = subscription
        entry['feedback_reason'] = None
        return True

    def _action_runtime(self, name: str) -> dict[str, Any]:
        with self._lock:
            return runtime_snapshot(self._action_subscriptions.get(name))

    def _action_status_callback(self, name: str):
        def callback(message: Any) -> None:
            received_at = time()
            with self._lock:
                entry = self._action_subscriptions.get(name)
                if entry is None:
                    return

                update_status_runtime(
                    entry,
                    message=message,
                    received_at=received_at,
                )

        return callback

    def _action_feedback_callback(self, name: str):
        def callback(message: Any) -> None:
            received_at = time()
            with self._lock:
                entry = self._action_subscriptions.get(name)
                if entry is None:
                    return

                update_feedback_runtime(
                    entry,
                    message=message,
                    received_at=received_at,
                )

        return callback

    def _cleanup_disappeared_action_subscriptions(
        self,
        action_names: set[str],
    ) -> None:
        if self._node is None:
            return

        with self._lock:
            stale_names = [
                name for name in self._action_subscriptions
                if name not in action_names
            ]
            stale_entries = [
                self._action_subscriptions.pop(name)
                for name in stale_names
            ]

        self._action_results.cleanup_actions(stale_names)

        for entry in stale_entries:
            self._destroy_action_entry_subscriptions(entry)

    def _destroy_action_entry_subscriptions(
        self,
        entry: dict[str, Any],
    ) -> None:
        if self._node is None:
            return

        for key in ('status_subscription', 'feedback_subscription'):
            subscription = entry.get(key)
            if subscription is None:
                continue

            try:
                self._node.destroy_subscription(subscription)
            except Exception as exc:  # pragma: no cover
                LOGGER.warning(
                    'Failed to destroy action subscription: %s',
                    exc,
                )

    def _action_monitor_subscriber_count(self, topic_name: str) -> int:
        count = 0
        with self._lock:
            entries = list(self._action_subscriptions.items())

        for action_name, entry in entries:
            if (
                topic_name == f'{action_name}/_action/status'
                and entry.get('status_subscription') is not None
            ):
                count += 1
            if (
                topic_name == f'{action_name}/_action/feedback'
                and entry.get('feedback_subscription') is not None
            ):
                count += 1

        return count

    def _service_client_count(self, name: str) -> int:
        if self._node is None:
            return 0

        count_clients = getattr(self._node, 'count_clients', None)
        if count_clients is None:
            return 0

        try:
            return count_clients(name)
        except (AttributeError, NotImplementedError):
            return 0
        except Exception as exc:  # pragma: no cover
            LOGGER.warning(
                'Failed to count clients for service %s: %s',
                name,
                exc,
            )
            return 0
