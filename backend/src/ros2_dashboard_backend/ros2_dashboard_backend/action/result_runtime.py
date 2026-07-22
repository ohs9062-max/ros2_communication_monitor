"""Action 모니터링의 result_runtime 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any, Callable

from ros2_dashboard_backend.action.result import (
    build_get_result_request,
    build_result_error_state,
    build_result_state,
    load_result_service_class,
)
from ros2_dashboard_backend.action.subscriptions import (
    mark_goal_result_pending,
    terminal_goals_ready_for_result,
    update_goal_result,
)


class ActionResultRuntime:
    """Action 모니터링 runtime 상태와 cache를 관리하는 클래스입니다."""

    def __init__(
        self,
        *,
        action_subscriptions: dict[str, dict[str, Any]],
        auto_fetch_result_for_observed_goals: bool,
        lock: Any,
        node_getter: Callable[[], Any],
    ) -> None:
        """Action 모니터링에서 내부 보조 처리를 수행하는 내부 helper 함수입니다."""
        self._action_subscriptions = action_subscriptions
        self._auto_fetch_result_for_observed_goals = (
            auto_fetch_result_for_observed_goals
        )
        self._lock = lock
        self._node_getter = node_getter
        self._action_result_clients: dict[str, Any] = {}
        self._action_result_service_classes: dict[str, Any] = {}
        self._action_result_pending: dict[tuple[str, str], Any] = {}

    def bind_action_subscriptions(
        self,
        action_subscriptions: dict[str, dict[str, Any]],
    ) -> None:
        """Action 모니터링에서 Action 실행 또는 상태를 처리하는 함수입니다."""
        self._action_subscriptions = action_subscriptions

    def clear(self) -> None:
        """Action 모니터링에서 cache와 runtime 상태를 초기화하는 함수입니다."""
        with self._lock:
            self._action_result_clients = {}
            self._action_result_service_classes = {}
            self._action_result_pending = {}

    def cleanup_actions(self, stale_names: list[str]) -> None:
        """Action 모니터링에서 Action 실행 또는 상태를 처리하는 함수입니다."""
        if not stale_names:
            return

        stale_name_set = set(stale_names)
        with self._lock:
            for key in list(self._action_result_pending):
                if key[0] in stale_name_set:
                    self._action_result_pending.pop(key, None)
            for name in stale_names:
                self._action_result_clients.pop(name, None)

    def support(
        self,
        action_type: str | None,
    ) -> tuple[bool, str | None, str | None]:
        """Action 모니터링에서 요청된 처리를 수행하는 함수입니다."""
        if not self._auto_fetch_result_for_observed_goals:
            return False, None, 'observed goal result fetch disabled'

        service_class, result_policy, result_reason = (
            self._result_service_class(action_type)
        )
        return service_class is not None, result_policy, result_reason

    def update(self, actions: list[dict[str, Any]]) -> None:
        """Action 모니터링에서 runtime 상태를 갱신하는 함수입니다."""
        self._complete_action_result_futures()
        for action in actions:
            self._maybe_start_action_result_requests(action)

    def _complete_action_result_futures(self) -> None:
        with self._lock:
            pending_items = list(self._action_result_pending.items())

        for (action_name, goal_id), future in pending_items:
            if not future.done():
                continue

            self._record_action_result_done(
                action_name=action_name,
                goal_id=goal_id,
                future=future,
            )

    def _maybe_start_action_result_requests(
        self,
        action: dict[str, Any],
    ) -> None:
        node = self._node_getter()
        if node is None:
            return

        if action.get('result_supported') is not True:
            return

        action_name = action['name']
        action_type = action.get('type')
        service_class, _policy, _reason = self._result_service_class(
            action_type,
        )
        if service_class is None:
            return

        with self._lock:
            entry = self._action_subscriptions.get(action_name)
            goals = (
                terminal_goals_ready_for_result(entry)
                if entry is not None
                else []
            )

        for goal in goals:
            goal_id = goal.get('goal_id')
            goal_id_msg = goal.get('goal_id_msg')
            if goal_id is None or goal_id_msg is None:
                continue

            key = (action_name, goal_id)
            with self._lock:
                if key in self._action_result_pending:
                    continue

            try:
                client = self._action_result_client(
                    action_name,
                    service_class,
                )
                request = build_get_result_request(
                    service_class,
                    goal_id_msg,
                )
                future = client.call_async(request)
            except Exception as exc:
                self._record_action_result_error(
                    action_name=action_name,
                    goal_id=goal_id,
                    message=str(exc),
                )
                continue

            with self._lock:
                current = self._action_subscriptions.get(action_name)
                if current is None:
                    continue

                mark_goal_result_pending(current, goal_id)
                self._action_result_pending[key] = future

            future.add_done_callback(
                lambda done_future, action_name=action_name,
                goal_id=goal_id: self._record_action_result_done(
                    action_name=action_name,
                    goal_id=goal_id,
                    future=done_future,
                ),
            )

    def _record_action_result_done(
        self,
        *,
        action_name: str,
        goal_id: str,
        future: Any,
    ) -> None:
        key = (action_name, goal_id)
        with self._lock:
            current = self._action_result_pending.get(key)
            if current is not future:
                return

        try:
            response = future.result()
            state = build_result_state(response)
        except Exception as exc:
            state = build_result_error_state(str(exc))

        with self._lock:
            current = self._action_result_pending.get(key)
            if current is not future:
                return

            entry = self._action_subscriptions.get(action_name)
            if entry is not None:
                update_goal_result(
                    entry,
                    goal_id=goal_id,
                    state=state,
                )
            self._action_result_pending.pop(key, None)

    def _record_action_result_error(
        self,
        *,
        action_name: str,
        goal_id: str,
        message: str,
    ) -> None:
        with self._lock:
            entry = self._action_subscriptions.get(action_name)
            if entry is not None:
                update_goal_result(
                    entry,
                    goal_id=goal_id,
                    state=build_result_error_state(message),
                )
            self._action_result_pending.pop((action_name, goal_id), None)

    def _action_result_client(self, name: str, service_class: type):
        node = self._node_getter()
        if node is None:
            raise RuntimeError('ROS2 monitor is not running')

        client = self._action_result_clients.get(name)
        if client is not None:
            return client

        client = node.create_client(
            service_class,
            f'{name}/_action/get_result',
        )
        self._action_result_clients[name] = client
        return client

    def _result_service_class(
        self,
        action_type: str | None,
    ) -> tuple[type | None, str | None, str | None]:
        cache_key = action_type or ''
        if cache_key in self._action_result_service_classes:
            cached = self._action_result_service_classes[cache_key]
            return (
                cached.get('service_class'),
                cached.get('result_policy'),
                cached.get('result_reason'),
            )

        service_class, result_policy, result_reason = (
            load_result_service_class(action_type)
        )
        self._action_result_service_classes[cache_key] = {
            'service_class': service_class,
            'result_policy': result_policy,
            'result_reason': result_reason,
        }
        return service_class, result_policy, result_reason
