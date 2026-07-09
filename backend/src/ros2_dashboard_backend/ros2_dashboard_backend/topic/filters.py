"""Topic filtering and supported type decisions."""

from __future__ import annotations

from ros2_dashboard_backend.topic.preview import is_preview_supported


def is_topic_included(
    name: str,
    *,
    include_names: tuple[str, ...] = (),
    exclude_names: tuple[str, ...] = (),
    exclude_prefixes: tuple[str, ...] = (),
) -> bool:
    """Return whether a topic name should appear in topic monitoring."""
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
    """Return whether a primary topic type is excluded."""
    if topic_type is None:
        return False

    return topic_type in exclude_types


def is_supported_type(
    topic_type: str | None,
    *,
    supported_types: tuple[str, ...],
) -> bool:
    """Return whether the topic type supports deep monitoring."""
    if topic_type is None:
        return False

    return topic_type in supported_types and is_preview_supported(topic_type)


def should_deep_monitor(
    *,
    auto_discover: bool,
    auto_subscribe_supported_types: bool,
    topic_type: str | None,
    supported_type: bool,
) -> bool:
    """Return whether a topic is eligible for automatic deep monitoring."""
    return (
        auto_discover
        and auto_subscribe_supported_types
        and topic_type is not None
        and supported_type
    )
