"""Topic 모니터링의 filters 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

def is_topic_included(
    name: str,
    *,
    include_names: tuple[str, ...] = (),
    exclude_names: tuple[str, ...] = (),
    exclude_prefixes: tuple[str, ...] = (),
) -> bool:
    """Topic 모니터링에서 조건 만족 여부를 판단하는 함수입니다."""
    if include_names and name not in include_names:
        return False

    if name in exclude_names:
        return False

    return not any(
        name.startswith(prefix)
        for prefix in exclude_prefixes
        if prefix
    )


def is_topic_type_excluded(
    topic_type: str | None,
    *,
    exclude_types: tuple[str, ...] = (),
) -> bool:
    """Topic 모니터링에서 조건 만족 여부를 판단하는 함수입니다."""
    if topic_type is None:
        return False

    return topic_type in exclude_types


def is_supported_type(
    topic_type: str | None,
    *,
    supported_types: tuple[str, ...],
) -> bool:
    """Topic 모니터링에서 조건 만족 여부를 판단하는 함수입니다."""
    if topic_type is None:
        return False

    return topic_type in supported_types


def should_deep_monitor(
    *,
    auto_discover: bool,
    auto_subscribe_supported_types: bool,
    topic_type: str | None,
    supported_type: bool,
) -> bool:
    """Topic 모니터링에서 조건 만족 여부를 판단하는 함수입니다."""
    return (
        auto_discover
        and auto_subscribe_supported_types
        and topic_type is not None
        and supported_type
    )
