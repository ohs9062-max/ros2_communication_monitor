"""Topic 모니터링의 subscriptions 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from time import time
from typing import Any

from ros2_dashboard_backend.topic.hz import recent_timestamps


DEFAULT_SUBSCRIPTION_CLEANUP_AFTER_SEC = 60.0


def build_subscription_entry(
    *,
    topic_type: str,
    subscription: Any,
) -> dict[str, Any]:
    """Topic 모니터링에서 public API 응답 항목을 조립하는 함수입니다."""
    return {
        'type': topic_type,
        'subscription': subscription,
        'message_preview': None,
        'created_at': time(),
        'last_received_at': None,
        'timestamps': [],
    }


def has_subscription(
    entry: dict[str, Any] | None,
    *,
    topic_type: str,
) -> bool:
    """Topic 모니터링에서 조건 만족 여부를 판단하는 함수입니다."""
    return entry is not None and entry.get('type') == topic_type


def update_subscription_entry(
    entry: dict[str, Any],
    *,
    message_preview: dict[str, Any],
    received_at: float,
    window_sec: float,
) -> None:
    """Topic 모니터링에서 runtime 상태를 갱신하는 함수입니다."""
    entry['message_preview'] = message_preview
    entry['last_received_at'] = received_at
    entry['timestamps'].append(received_at)
    entry['timestamps'] = recent_timestamps(
        entry['timestamps'],
        now=received_at,
        window_sec=window_sec,
    )


def cleanup_candidates(
    subscriptions: dict[str, dict[str, Any]],
    *,
    retained_topic_names: set[str],
    now: float,
    cleanup_after_sec: float,
) -> list[tuple[str, Any]]:
    """Topic 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    candidates = []
    for name, entry in subscriptions.items():
        if name in retained_topic_names:
            entry.pop('disappeared_at', None)
            continue

        disappeared_at = entry.get('disappeared_at')
        if disappeared_at is None:
            entry['disappeared_at'] = now
            continue

        if now - disappeared_at >= cleanup_after_sec:
            candidates.append((name, entry.get('subscription')))

    return candidates


def remove_subscription_entry(
    subscriptions: dict[str, dict[str, Any]],
    *,
    name: str,
    subscription: Any,
) -> bool:
    """Topic 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    entry = subscriptions.get(name)
    if entry is None or entry.get('subscription') is not subscription:
        return False

    del subscriptions[name]
    return True
