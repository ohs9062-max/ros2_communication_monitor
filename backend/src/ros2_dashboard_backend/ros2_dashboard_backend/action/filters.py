"""Action filtering helpers."""

from __future__ import annotations


def is_action_included(
    name: str,
    *,
    include_names: tuple[str, ...] = (),
    exclude_names: tuple[str, ...] = (),
    exclude_prefixes: tuple[str, ...] = (),
) -> bool:
    """Return whether an action is allowed by config filters."""
    if include_names and name not in include_names:
        return False

    if name in exclude_names:
        return False

    return not any(
        name.startswith(prefix)
        for prefix in exclude_prefixes
        if prefix
    )
