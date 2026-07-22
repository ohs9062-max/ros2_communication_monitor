"""Service 모니터링의 introspection 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from typing import Any

from rosidl_runtime_py.utilities import get_service


SERVICE_EVENT_SUFFIX = '/_service_event'


def service_event_topic_name(service_name: str) -> str:
    """Service 모니터링에서 Service 실행 또는 상태를 처리하는 함수입니다."""
    return f'{service_name.rstrip("/")}{SERVICE_EVENT_SUFFIX}'


def service_event_class(service_type: str) -> type:
    """Service 모니터링에서 Service 실행 또는 상태를 처리하는 함수입니다."""
    return get_service(service_type).Event


def build_service_event_subscription_spec(
    *,
    service_name: str,
    service_type: str,
) -> dict[str, Any]:
    """Service 모니터링에서 Service 실행 또는 상태를 처리하는 함수입니다."""
    return {
        'topic_name': service_event_topic_name(service_name),
        'event_class': service_event_class(service_type),
    }
