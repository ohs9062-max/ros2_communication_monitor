"""Runtime owner for ROS 2 action graph and event monitoring."""

from __future__ import annotations

import logging
from time import time
from typing import Any, Callable

from rclpy.action.graph import (
    get_action_client_names_and_types_by_node,
    get_action_names_and_types,
    get_action_server_names_and_types_by_node,
)
from rclpy.qos import QoSProfile

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


LOGGER = logging.getLogger(__name__)


class ActionRuntime:
    """Collect action graph data and own action event subscriptions."""

    def __init__(
        self,
        *,
        config: MonitorConfig,
        lock: Any,
        node_getter: Callable[[], Any],
    ) -> None:
        """Initialize action runtime with shared monitor dependencies."""
        self._config = config
        self._lock = lock
        self._node_getter = node_getter
        self._actions: list[dict[str, Any]] = []
        self._last_updated = 0.0
        self._subscriptions: dict[str, dict[str, Any]] = {}
        self._result_runtime = ActionResultRuntime(
            action_subscriptions=self._subscriptions,
            auto_fetch_result_for_observed_goals=(
                config.actions_auto_fetch_result_for_observed_goals
            ),
            lock=lock,
            node_getter=node_getter,
        )

    def clear(self) -> None:
        """Clear action graph, subscriptions, and result runtime state."""
        with self._lock:
            self._actions = []
            self._last_updated = 0.0
            self._subscriptions.clear()

        self._result_runtime.clear()

    def snapshot(self) -> dict[str, Any]:
        """Return a thread-safe snapshot of cached action state."""
        with self._lock:
            actions = [action.copy() for action in self._actions]
            last_updated = self._last_updated

        return {
            'actions': actions,
            'meta': action_meta(
                actions=actions,
                last_updated=last_updated,
            ),
        }

    def update(self) -> list[dict[str, Any]]:
        """Refresh action graph, subscriptions, and observed results."""
        node = self._node_getter()
        if node is None:
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
            capabilities = self._ensure_subscriptions(
                name=name,
                action_type=action_type,
            )
            runtime = self._runtime_snapshot(name)
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
            self._last_updated = updated_at

        self._cleanup_disappeared_subscriptions(
            {action['name'] for action in actions},
        )
        self._result_runtime.update(actions)
        return actions

    def monitor_subscriber_count(self, topic_name: str) -> int:
        """Return subscriptions created for action status or feedback."""
        count = 0
        with self._lock:
            entries = list(self._subscriptions.items())

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

    def _action_names_and_types(self) -> list[tuple[str, list[str]]]:
        node = self._node_getter()
        if node is None:
            return []

        try:
            return get_action_names_and_types(node)
        except Exception as exc:  # pragma: no cover
            LOGGER.warning('Failed to read action graph: %s', exc)
            return []

    def _action_count_maps(self) -> tuple[dict[str, int], dict[str, int]]:
        node = self._node_getter()
        if node is None:
            return {}, {}

        server_counts: dict[str, int] = {}
        client_counts: dict[str, int] = {}
        try:
            node_names = node.get_node_names_and_namespaces()
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
        node = self._node_getter()
        if node is None:
            return []

        try:
            return get_action_server_names_and_types_by_node(
                node,
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
        node = self._node_getter()
        if node is None:
            return []

        try:
            return get_action_client_names_and_types_by_node(
                node,
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

    def _ensure_subscriptions(
        self,
        *,
        name: str,
        action_type: str | None,
    ) -> dict[str, Any]:
        if self._node_getter() is None:
            return self._capabilities(None)

        with self._lock:
            entry = self._subscriptions.get(name)
            if action_entry_matches(entry, action_type=action_type):
                return self._capabilities(entry)

            if entry is not None:
                self._destroy_entry_subscriptions(entry)

            entry = build_action_subscription_entry(
                action_type=action_type,
            )
            self._subscriptions[name] = entry

        status_supported = self._maybe_create_status_subscription(
            name,
            entry,
        )
        feedback_supported = self._maybe_create_feedback_subscription(
            name,
            action_type,
            entry,
        )
        result_supported, result_policy, result_reason = (
            self._result_runtime.support(action_type)
        )

        with self._lock:
            current = self._subscriptions.get(name)
            if current is entry:
                current['status_supported'] = status_supported
                current['feedback_supported'] = feedback_supported
                current['result_supported'] = result_supported
                current['result_policy'] = result_policy
                current['result_reason'] = result_reason

        return self._capabilities(entry)

    @staticmethod
    def _capabilities(entry: dict[str, Any] | None) -> dict[str, Any]:
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

    def _maybe_create_status_subscription(
        self,
        name: str,
        entry: dict[str, Any],
    ) -> bool:
        node = self._node_getter()
        if node is None:
            return False

        if not self._config.actions_auto_monitor_status:
            return False

        message_class = load_status_message_class()
        if message_class is None:
            return False

        try:
            subscription = node.create_subscription(
                message_class,
                f'{name}/_action/status',
                self._status_callback(name),
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

    def _maybe_create_feedback_subscription(
        self,
        name: str,
        action_type: str | None,
        entry: dict[str, Any],
    ) -> bool:
        node = self._node_getter()
        if node is None:
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
            subscription = node.create_subscription(
                message_class,
                f'{name}/_action/feedback',
                self._feedback_callback(name),
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

    def _runtime_snapshot(self, name: str) -> dict[str, Any]:
        with self._lock:
            return runtime_snapshot(self._subscriptions.get(name))

    def _status_callback(self, name: str):
        def callback(message: Any) -> None:
            received_at = time()
            with self._lock:
                entry = self._subscriptions.get(name)
                if entry is None:
                    return

                update_status_runtime(
                    entry,
                    message=message,
                    received_at=received_at,
                )

        return callback

    def _feedback_callback(self, name: str):
        def callback(message: Any) -> None:
            received_at = time()
            with self._lock:
                entry = self._subscriptions.get(name)
                if entry is None:
                    return

                update_feedback_runtime(
                    entry,
                    message=message,
                    received_at=received_at,
                )

        return callback

    def _cleanup_disappeared_subscriptions(
        self,
        action_names: set[str],
    ) -> None:
        if self._node_getter() is None:
            return

        with self._lock:
            stale_names = [
                name for name in self._subscriptions
                if name not in action_names
            ]
            stale_entries = [
                self._subscriptions.pop(name)
                for name in stale_names
            ]

        self._result_runtime.cleanup_actions(stale_names)

        for entry in stale_entries:
            self._destroy_entry_subscriptions(entry)

    def _destroy_entry_subscriptions(
        self,
        entry: dict[str, Any],
    ) -> None:
        node = self._node_getter()
        if node is None:
            return

        for key in ('status_subscription', 'feedback_subscription'):
            subscription = entry.get(key)
            if subscription is None:
                continue

            try:
                node.destroy_subscription(subscription)
            except Exception as exc:  # pragma: no cover
                LOGGER.warning(
                    'Failed to destroy action subscription: %s',
                    exc,
                )
