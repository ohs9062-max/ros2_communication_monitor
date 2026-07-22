"""Node 모니터링의 filters 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

from ros2_dashboard_backend.node.models import full_node_name


def is_node_included(
    *,
    name: str,
    namespace: str,
    include_names: tuple[str, ...] = (),
    exclude_names: tuple[str, ...] = (),
    exclude_prefixes: tuple[str, ...] = (),
) -> bool:
    """Node 모니터링에서 조건 만족 여부를 판단하는 함수입니다."""
    full_name = full_node_name(name, namespace)
    names = {name, full_name}

    if include_names and not any(item in names for item in include_names):
        return False

    if any(item in names for item in exclude_names):
        return False

    return not any(full_name.startswith(prefix) for prefix in exclude_prefixes)
