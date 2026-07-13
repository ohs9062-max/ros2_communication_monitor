"""Runtime owner for ROS 2 service graph and active-check state."""

from __future__ import annotations

import logging
from time import time
from typing import Any, Callable

from ros2_dashboard_backend.config_loader import MonitorConfig
from ros2_dashboard_backend.service.active_check_runtime import (
    ServiceActiveCheckRuntime,
)
from ros2_dashboard_backend.service.discovery import build_service_item
from ros2_dashboard_backend.service.filters import (
    is_service_included,
    is_supported_type,
)
from ros2_dashboard_backend.service.models import service_meta


LOGGER = logging.getLogger(__name__)


class ServiceRuntime:
    """Collect service graph data and coordinate safe active checks."""

    def __init__(
        self,
        *,
        config: MonitorConfig,
        lock: Any,
        node_getter: Callable[[], Any],
    ) -> None:
        """Initialize service runtime with shared monitor dependencies."""
        self._config = config
        self._lock = lock
        self._node_getter = node_getter
        self._services: list[dict[str, Any]] = []
        self._last_updated = 0.0
        self._active_checks = ServiceActiveCheckRuntime(
            active_check_config=config.services_active_check,
            lock=lock,
            node_getter=node_getter,
        )

    def clear(self) -> None:
        """Clear service graph and active-check runtime state."""
        with self._lock:
            self._services = []
            self._last_updated = 0.0

        self._active_checks.clear()

    def snapshot(
        self,
        *,
        include_hidden: bool = False,
    ) -> dict[str, Any]:
        """Return a thread-safe public service snapshot."""
        with self._lock:
            all_services = [service.copy() for service in self._services]
            last_updated = self._last_updated

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

    def alert_snapshot(self) -> list[dict[str, Any]]:
        """Return service items used by the service alert builder."""
        with self._lock:
            return [service.copy() for service in self._services]

    def update(self) -> list[dict[str, Any]]:
        """Refresh service graph data and merge active-check cache."""
        node = self._node_getter()
        if node is None:
            return []

        services = []
        updated_at = time()
        active_check_cache = self._active_checks.cache_snapshot()

        for name, types in node.get_service_names_and_types():
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
                    server_count=node.count_services(name),
                    client_count=self._client_count(name),
                    supported_type=is_supported_type(service_type),
                    updated_at=updated_at,
                    active_check_config=(
                        self._config.services_active_check
                    ),
                    active_check_allowlist=self._active_checks.allowlist,
                    active_check_cache=active_check_cache,
                ),
            )

        services.sort(key=lambda service: service['name'])

        with self._lock:
            self._services = services
            self._last_updated = updated_at

        return services

    def update_active_checks(
        self,
        services: list[dict[str, Any]],
    ) -> None:
        """Advance allowlisted active checks after graph refresh."""
        self._active_checks.update(services)

    def _client_count(self, name: str) -> int:
        node = self._node_getter()
        if node is None:
            return 0

        count_clients = getattr(node, 'count_clients', None)
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
