"""Action 모니터링의 filters 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations


def is_action_included(
    name: str,
    *,
    include_names: tuple[str, ...] = (),
    exclude_names: tuple[str, ...] = (),
    exclude_prefixes: tuple[str, ...] = (),
) -> bool:
    """Action 모니터링에서 Action 실행 또는 상태를 처리하는 함수입니다."""
    if include_names and name not in include_names:
        return False

    if name in exclude_names:
        return False

    return not any(
        name.startswith(prefix)
        for prefix in exclude_prefixes
        if prefix
    )
