"""Explicit user-triggered service call runtime for registered interfaces."""

from __future__ import annotations

import threading
from time import time
from typing import Any, Callable

from ros2_dashboard_backend.interface_apply import refresh_install_python_paths
from ros2_dashboard_backend.interface_registry import registry_snapshot
from ros2_dashboard_backend.service.active_check import (
    build_request,
    load_service_class,
    response_to_preview,
)


MAX_HISTORY_ITEMS = 30
DEFAULT_TIMEOUT_SEC = 2.0
MAX_TIMEOUT_SEC = 10.0


class ServiceCallError(ValueError):
    """Raised when an explicit service call request is not allowed or failed."""


class ServiceCallRuntime:
    """Run explicit user-triggered service calls for registered .srv types."""

    def __init__(
        self,
        *,
        lock: Any,
        node_getter: Callable[[], Any],
    ) -> None:
        self._lock = lock
        self._node_getter = node_getter
        self._clients: dict[tuple[str, str], Any] = {}
        self._history: list[dict[str, Any]] = []

    def clear(self) -> None:
        """Clear cached clients and call history."""
        with self._lock:
            self._clients = {}
            self._history = []

    def callable_services(self) -> dict[str, Any]:
        """Return registered services with explicit call eligibility state."""
        refresh_install_python_paths()
        registered = self._registered_services()
        graph = self._service_graph()
        services: list[dict[str, Any]] = []

        for entry in registered:
            service_type = entry['service_type']
            matching = [
                item for item in graph
                if item['type'] == service_type
            ]
            if not matching:
                services.append(self._service_state(entry, None))
                continue
            for graph_item in matching:
                services.append(self._service_state(entry, graph_item))

        services.sort(key=lambda item: (item['service_type'], item['service_name']))
        return {
            'services': services,
            'meta': {
                'count': len(services),
                'registered_count': len(registered),
                'callable_count': sum(1 for item in services if item['callable']),
            },
        }

    def call_service(
        self,
        *,
        service_name: str,
        service_type: str,
        request_data: dict[str, Any],
        timeout_sec: float | None = None,
    ) -> dict[str, Any]:
        """Call one registered service and return a JSON-safe response."""
        timeout = _normalized_timeout(timeout_sec)
        refresh_install_python_paths()
        allowed = self._allowed_service(service_name, service_type)
        if allowed is None:
            raise ServiceCallError(
                'registry에 등록되고 import 가능한 Service이며, 현재 server가 있는 경우만 호출할 수 있습니다.',
            )

        node = self._node_getter()
        if node is None:
            raise ServiceCallError('ROS2 monitor node가 실행 중이 아닙니다.')

        started_at = time()
        try:
            service_class = load_service_class(service_type)
            request = build_request(service_class, request_data)
            client = self._client(service_name, service_type, service_class)
            if not client.service_is_ready():
                raise ServiceCallError('Service server가 준비되지 않았습니다.')

            future = client.call_async(request)
            event = threading.Event()
            future.add_done_callback(lambda _future: event.set())
            if not event.wait(timeout=timeout):
                raise TimeoutError(f'service call timeout after {timeout:.2f}s')
            response = future.result()
            elapsed_ms = (time() - started_at) * 1000.0
            response_preview = response_to_preview(response)
            result = {
                'success': True,
                'service_name': service_name,
                'service_type': service_type,
                'request': request_data,
                'response': response_preview,
                'elapsed_ms': elapsed_ms,
                'timeout_sec': timeout,
                'called_at': started_at,
            }
        except Exception as exc:
            elapsed_ms = (time() - started_at) * 1000.0
            result = {
                'success': False,
                'service_name': service_name,
                'service_type': service_type,
                'request': request_data,
                'response': None,
                'elapsed_ms': elapsed_ms,
                'timeout_sec': timeout,
                'called_at': started_at,
                'error': str(exc),
            }
            self._record_history(result)
            if isinstance(exc, ServiceCallError):
                raise
            raise ServiceCallError(str(exc)) from exc

        self._record_history(result)
        return result

    def history(self) -> dict[str, Any]:
        """Return recent explicit service call history."""
        with self._lock:
            calls = [item.copy() for item in self._history]
        return {
            'calls': calls,
            'meta': {
                'count': len(calls),
            },
        }

    def _allowed_service(
        self,
        service_name: str,
        service_type: str,
    ) -> dict[str, Any] | None:
        registered = self._registered_services()
        if not any(
            item['service_type'] == service_type
            and item['import_available'] is True
            for item in registered
        ):
            return None

        for item in self._service_graph():
            if (
                item['name'] == service_name
                and item['type'] == service_type
                and item['server_count'] > 0
            ):
                return item
        return None

    def _registered_services(self) -> list[dict[str, Any]]:
        registry = registry_snapshot()['interface_registry']
        services = []
        for item in registry.get('services', []):
            build = item.get('build') or {}
            package_name = build.get('interface_package')
            type_name = item.get('type_name')
            if not package_name or not type_name:
                continue
            services.append({
                'file_name': item.get('file_name'),
                'type_name': type_name,
                'service_type': f'{package_name}/srv/{type_name}',
                'request_schema': item.get('parsed', {}).get('request', []),
                'response_schema': item.get('parsed', {}).get('response', []),
                'saved_path': build.get('saved_path'),
                'import_available': build.get('import_available') is True,
                'import_error': build.get('import_error'),
            })
        return services

    def _service_graph(self) -> list[dict[str, Any]]:
        node = self._node_getter()
        if node is None:
            return []

        graph = []
        for name, types in node.get_service_names_and_types():
            service_type = types[0] if types else None
            if not service_type:
                continue
            graph.append({
                'name': name,
                'type': service_type,
                'server_count': node.count_services(name),
                'client_count': self._client_count(name),
            })
        return graph

    def _client(self, name: str, service_type: str, service_class: type):
        key = (name, service_type)
        with self._lock:
            client = self._clients.get(key)
            if client is not None:
                return client

            node = self._node_getter()
            if node is None:
                raise ServiceCallError('ROS2 monitor node가 실행 중이 아닙니다.')

            client = node.create_client(service_class, name)
            self._clients[key] = client
            return client

    def _client_count(self, name: str) -> int:
        node = self._node_getter()
        if node is None:
            return 0
        count_clients = getattr(node, 'count_clients', None)
        if count_clients is None:
            return 0
        try:
            return count_clients(name)
        except Exception:
            return 0

    def _service_state(
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
            'service_name': graph_item['name'] if graph_item else '',
            'service_type': entry['service_type'],
            'file_name': entry['file_name'],
            'type_name': entry['type_name'],
            'request_schema': entry['request_schema'],
            'response_schema': entry['response_schema'],
            'import_available': import_available,
            'import_error': entry.get('import_error'),
            'server_available': server_available,
            'server_count': server_count,
            'client_count': int(graph_item.get('client_count') or 0) if graph_item else 0,
            'callable': callable_now,
            'reason': reason,
            'saved_path': entry.get('saved_path'),
        }

    def _record_history(self, item: dict[str, Any]) -> None:
        with self._lock:
            self._history.insert(0, item)
            del self._history[MAX_HISTORY_ITEMS:]


def _normalized_timeout(timeout_sec: float | None) -> float:
    if timeout_sec is None:
        return DEFAULT_TIMEOUT_SEC
    try:
        timeout = float(timeout_sec)
    except (TypeError, ValueError) as exc:
        raise ServiceCallError('timeout_sec 값이 올바르지 않습니다.') from exc
    if timeout <= 0:
        raise ServiceCallError('timeout_sec는 0보다 커야 합니다.')
    return min(timeout, MAX_TIMEOUT_SEC)
