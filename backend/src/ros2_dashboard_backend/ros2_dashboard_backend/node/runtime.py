"""Node 모니터링의 runtime 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

import logging
from time import time
from typing import Any, Callable

from rclpy.action.graph import (
    get_action_client_names_and_types_by_node,
    get_action_server_names_and_types_by_node,
)

from ros2_dashboard_backend.node.discovery import (
    build_node_item,
)
from ros2_dashboard_backend.node.filters import is_node_included
from ros2_dashboard_backend.node.models import node_meta
from ros2_dashboard_backend.resource_state import (
    disconnected_resource,
    mark_graph_present,
)


LOGGER = logging.getLogger(__name__)


class NodeRuntime:
    """Node 모니터링 runtime 상태와 cache를 관리하는 클래스입니다."""

    def __init__(
        self,
        *,
        exclude_names: tuple[str, ...],
        exclude_prefixes: tuple[str, ...],
        include_names: tuple[str, ...],
        lock: Any,
        node_getter: Callable[[], Any],
        stale_timeout_sec: float,
    ) -> None:
        """Node 모니터링에서 내부 보조 처리를 수행하는 내부 helper 함수입니다."""
        self._exclude_names = exclude_names
        self._exclude_prefixes = exclude_prefixes
        self._include_names = include_names
        self._lock = lock
        self._node_getter = node_getter
        self._stale_timeout_sec = stale_timeout_sec
        self._nodes: dict[str, dict[str, Any]] = {}
        self._last_updated = 0.0

    def clear(self) -> None:
        """Node 모니터링에서 cache와 runtime 상태를 초기화하는 함수입니다."""
        with self._lock:
            self._nodes = {}
            self._last_updated = 0.0

    def snapshot(self) -> dict[str, Any]:
        """Node 모니터링에서 cache snapshot을 반환하는 함수입니다."""
        with self._lock:
            nodes = [node.copy() for node in self._nodes.values()]
            last_updated = self._last_updated

        nodes.sort(key=lambda node: node.get('full_name', ''))
        return {
            'nodes': nodes,
            'meta': node_meta(
                nodes=nodes,
                last_updated=last_updated,
            ),
        }

    def update(self) -> list[dict[str, Any]]:
        """Node 모니터링에서 runtime 상태를 갱신하는 함수입니다."""
        node = self._node_getter()
        if node is None:
            return []

        updated_at = time()
        discovered_nodes = self._node_names_and_namespaces(node)
        next_nodes: dict[str, dict[str, Any]] = {}

        for node_name, namespace in discovered_nodes:
            if not is_node_included(
                name=node_name,
                namespace=namespace,
                include_names=self._include_names,
                exclude_names=self._exclude_names,
                exclude_prefixes=self._exclude_prefixes,
            ):
                continue

            item = build_node_item(
                name=node_name,
                namespace=namespace,
                topic_publishers=self._graph_by_node(
                    node.get_publisher_names_and_types_by_node,
                    node_name,
                    namespace,
                    'publishers',
                ),
                topic_subscribers=self._graph_by_node(
                    node.get_subscriber_names_and_types_by_node,
                    node_name,
                    namespace,
                    'subscribers',
                ),
                service_servers=self._graph_by_node(
                    node.get_service_names_and_types_by_node,
                    node_name,
                    namespace,
                    'service servers',
                ),
                service_clients=self._graph_by_node(
                    node.get_client_names_and_types_by_node,
                    node_name,
                    namespace,
                    'service clients',
                ),
                action_servers=self._action_servers_by_node(
                    node,
                    node_name,
                    namespace,
                ),
                action_clients=self._action_clients_by_node(
                    node,
                    node_name,
                    namespace,
                ),
                updated_at=updated_at,
            )
            next_nodes[item['full_name']] = mark_graph_present(
                item,
                observed_at=updated_at,
            )

        with self._lock:
            for full_name, cached_node in self._nodes.items():
                if full_name in next_nodes:
                    continue

                next_nodes[full_name] = disconnected_resource(
                    cached_node,
                    detected_at=updated_at,
                    count_fields=(
                        'publisher_count',
                        'subscriber_count',
                        'service_server_count',
                        'service_client_count',
                        'action_server_count',
                        'action_client_count',
                    ),
                )

            self._nodes = next_nodes
            self._last_updated = updated_at
            nodes = [item.copy() for item in self._nodes.values()]

        nodes.sort(key=lambda item: item.get('full_name', ''))
        return nodes

    @staticmethod
    def _node_names_and_namespaces(node: Any) -> list[tuple[str, str]]:
        try:
            return list(node.get_node_names_and_namespaces())
        except Exception as exc:  # pragma: no cover
            LOGGER.warning('Failed to read ROS2 node graph: %s', exc)
            return []

    @staticmethod
    def _graph_by_node(
        graph_reader: Callable[[str, str], list[tuple[str, list[str]]]],
        node_name: str,
        namespace: str,
        label: str,
    ) -> list[tuple[str, list[str]]]:
        try:
            return list(graph_reader(node_name, namespace))
        except Exception as exc:  # pragma: no cover
            LOGGER.debug(
                'Failed to read node %s for %s%s: %s',
                label,
                namespace,
                node_name,
                exc,
            )
            return []

    @staticmethod
    def _action_servers_by_node(
        node: Any,
        node_name: str,
        namespace: str,
    ) -> list[tuple[str, list[str]]]:
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

    @staticmethod
    def _action_clients_by_node(
        node: Any,
        node_name: str,
        namespace: str,
    ) -> list[tuple[str, list[str]]]:
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
