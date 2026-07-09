"""Topic message frequency, age, and stale calculations."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.topic.models import (
    HZ_STATUS_NEVER_RECEIVED,
    HZ_STATUS_STALE,
    TOPIC_STATUS_ACTIVE,
)


def recent_timestamps(
    timestamps: list[float],
    *,
    now: float,
    window_sec: float,
) -> list[float]:
    """Keep timestamps that fall inside the configured Hz window."""
    earliest = now - window_sec
    return [timestamp for timestamp in timestamps if timestamp >= earliest]


def hz_status(
    *,
    last_received_at: float | None,
    now: float,
    stale_timeout_sec: float,
) -> tuple[float | None, bool, str]:
    """Return age, stale flag, and status for the latest message."""
    if last_received_at is None:
        return None, False, HZ_STATUS_NEVER_RECEIVED

    age_sec = now - last_received_at
    if age_sec > stale_timeout_sec:
        return age_sec, True, HZ_STATUS_STALE

    return age_sec, False, TOPIC_STATUS_ACTIVE


def build_hz_snapshot(
    *,
    timestamps: list[float],
    last_received_at: float | None,
    window_sec: float,
    stale_timeout_sec: float,
    now: float,
) -> dict[str, Any]:
    """Build the data fields used by /ros/topics/hz."""
    message_count = len(timestamps)
    hz = 0.0
    if message_count > 0:
        hz = round(message_count / window_sec, 2)

    age_sec, is_stale, status = hz_status(
        last_received_at=last_received_at,
        now=now,
        stale_timeout_sec=stale_timeout_sec,
    )

    return {
        'received': last_received_at is not None,
        'message_count': message_count,
        'window_sec': window_sec,
        'hz': hz,
        'last_received_at': last_received_at,
        'age_sec': age_sec,
        'is_stale': is_stale,
        'status': status,
    }
