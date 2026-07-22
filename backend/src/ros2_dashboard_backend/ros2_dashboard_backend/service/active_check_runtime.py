"""Service 모니터링의 active_check_runtime 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from time import time
from typing import Any, Callable

from ros2_dashboard_backend.service.active_check import (
    allowlist_map,
    build_request,
    error_state,
    load_service_class,
    pending_state,
    response_state,
    timeout_state,
)


class ServiceActiveCheckRuntime:
    """Service 모니터링 runtime 상태와 cache를 관리하는 클래스입니다."""

    def __init__(
        self,
        *,
        active_check_config: Any,
        lock: Any,
        node_getter: Callable[[], Any],
    ) -> None:
        """Service 모니터링에서 내부 보조 처리를 수행하는 내부 helper 함수입니다."""
        self._active_check_config = active_check_config
        self._lock = lock
        self._node_getter = node_getter
        self._active_check_allowlist = allowlist_map(active_check_config)
        self._active_check_cache: dict[str, dict[str, Any]] = {}
        self._active_check_pending: dict[str, dict[str, Any]] = {}
        self._active_check_clients: dict[str, Any] = {}
        self._active_check_last_run = 0.0

    @property
    def allowlist(self) -> dict[str, Any]:
        """Service 모니터링에서 요청된 처리를 수행하는 함수입니다."""
        return self._active_check_allowlist

    def cache_snapshot(self) -> dict[str, dict[str, Any]]:
        """Service 모니터링에서 cache snapshot을 반환하는 함수입니다."""
        with self._lock:
            return {
                name: state.copy()
                for name, state in self._active_check_cache.items()
            }

    def clear(self) -> None:
        """Service 모니터링에서 cache와 runtime 상태를 초기화하는 함수입니다."""
        with self._lock:
            self._active_check_cache = {}
            self._active_check_pending = {}
            self._active_check_clients = {}
            self._active_check_last_run = 0.0

    def update(self, services: list[dict[str, Any]]) -> None:
        """Service 모니터링에서 runtime 상태를 갱신하는 함수입니다."""
        now = time()
        self._complete_active_check_futures(now)

        config = self._active_check_config
        if not config.enabled:
            return

        if now - self._active_check_last_run < config.interval_sec:
            return

        self._active_check_last_run = now
        for service in services:
            self._maybe_start_active_check(service, now)

    def _complete_active_check_futures(self, now: float) -> None:
        with self._lock:
            pending_items = list(self._active_check_pending.items())

        for name, pending in pending_items:
            future = pending['future']
            started_at = pending['started_at']
            timeout_sec = pending['timeout_sec']
            if future.done():
                self._record_active_check_done(
                    name=name,
                    future=future,
                    completed_at=now,
                )
                continue

            if now - started_at <= timeout_sec:
                continue

            with self._lock:
                current = self._active_check_pending.get(name)
                if current is None or current.get('future') is not future:
                    continue

                self._active_check_cache[name] = timeout_state(
                    started_at=started_at,
                    timeout_sec=timeout_sec,
                )
                self._active_check_pending.pop(name, None)

    def _record_active_check_done(
        self,
        *,
        name: str,
        future: Any,
        completed_at: float,
    ) -> None:
        with self._lock:
            pending = self._active_check_pending.get(name)
            if pending is None or pending.get('future') is not future:
                return

        started_at = pending['started_at']
        timeout_sec = pending['timeout_sec']
        response_time_ms = (completed_at - started_at) * 1000.0

        try:
            response = future.result()
            state = response_state(
                response=response,
                success_field=pending['success_field'],
                checked_at=completed_at,
                timeout_sec=timeout_sec,
                response_time_ms=response_time_ms,
            )
        except Exception as exc:
            state = error_state(
                message=str(exc),
                checked_at=completed_at,
                timeout_sec=timeout_sec,
                response_time_ms=response_time_ms,
            )

        with self._lock:
            current = self._active_check_pending.get(name)
            if current is None or current.get('future') is not future:
                return

            self._active_check_cache[name] = state
            self._active_check_pending.pop(name, None)

    def _maybe_start_active_check(
        self,
        service: dict[str, Any],
        now: float,
    ) -> None:
        name = service['name']
        allowlist_item = self._active_check_allowlist.get(name)
        if allowlist_item is None:
            return

        if service.get('active_check_supported') is not True:
            return

        if allowlist_item.service_type != service.get('type'):
            return

        if service.get('server_count', 0) <= 0:
            return

        with self._lock:
            if name in self._active_check_pending:
                return

        request_data = allowlist_item.request
        if request_data is None:
            self._record_active_check_error(
                name=name,
                message='active_check request is missing or invalid',
                checked_at=now,
                timeout_sec=allowlist_item.timeout_sec,
            )
            return

        try:
            service_class = load_service_class(allowlist_item.service_type)
            request = build_request(service_class, request_data)
            client = self._active_check_client(name, service_class)
            future = client.call_async(request)
        except Exception as exc:
            self._record_active_check_error(
                name=name,
                message=str(exc),
                checked_at=now,
                timeout_sec=allowlist_item.timeout_sec,
            )
            return

        with self._lock:
            self._active_check_pending[name] = {
                'future': future,
                'started_at': now,
                'timeout_sec': allowlist_item.timeout_sec,
                'success_field': allowlist_item.success_field,
            }
            self._active_check_cache[name] = pending_state(
                started_at=now,
                timeout_sec=allowlist_item.timeout_sec,
            )

        future.add_done_callback(
            lambda done_future, service_name=name: (
                self._record_active_check_done(
                    name=service_name,
                    future=done_future,
                    completed_at=time(),
                )
            ),
        )

    def _record_active_check_error(
        self,
        *,
        name: str,
        message: str,
        checked_at: float,
        timeout_sec: float,
    ) -> None:
        with self._lock:
            self._active_check_cache[name] = error_state(
                message=message,
                checked_at=checked_at,
                timeout_sec=timeout_sec,
            )
            self._active_check_pending.pop(name, None)

    def _active_check_client(self, name: str, service_class: type):
        node = self._node_getter()
        if node is None:
            raise RuntimeError('ROS2 monitor is not running')

        client = self._active_check_clients.get(name)
        if client is not None:
            return client

        client = node.create_client(service_class, name)
        self._active_check_clients[name] = client
        return client
