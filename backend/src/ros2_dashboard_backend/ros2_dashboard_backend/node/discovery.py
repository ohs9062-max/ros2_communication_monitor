"""Helpers for building ROS graph node items."""

from __future__ import annotations

from typing import Any

from ros2_dashboard_backend.node.models import (
    full_node_name,
    graph_entities,
    node_status,
)


def build_node_item(
    *,
    name: str,
    namespace: str,
    topic_publishers: list[tuple[str, list[str]]],
    topic_subscribers: list[tuple[str, list[str]]],
    service_servers: list[tuple[str, list[str]]],
    service_clients: list[tuple[str, list[str]]],
    action_servers: list[tuple[str, list[str]]],
    action_clients: list[tuple[str, list[str]]],
    updated_at: float,
) -> dict[str, Any]:
    """Build a public /ros/nodes item for a discovered node."""
    status, reason = node_status(discovered=True)
    publisher_entities = graph_entities(topic_publishers)
    subscriber_entities = graph_entities(topic_subscribers)
    service_server_entities = graph_entities(service_servers)
    service_client_entities = graph_entities(service_clients)
    action_server_entities = graph_entities(action_servers)
    action_client_entities = graph_entities(action_clients)

    return {
        'name': name,
        'namespace': namespace,
        'full_name': full_node_name(name, namespace),
        'status': status,
        'reason': reason,
        'publisher_count': len(publisher_entities),
        'subscriber_count': len(subscriber_entities),
        'service_server_count': len(service_server_entities),
        'service_client_count': len(service_client_entities),
        'action_server_count': len(action_server_entities),
        'action_client_count': len(action_client_entities),
        'topic_publishers': publisher_entities,
        'topic_subscribers': subscriber_entities,
        'service_servers': service_server_entities,
        'service_clients': service_client_entities,
        'action_servers': action_server_entities,
        'action_clients': action_client_entities,
        'last_seen_at': updated_at,
        'last_updated': updated_at,
    }


def stale_node_item(
    *,
    cached_node: dict[str, Any],
    updated_at: float,
) -> dict[str, Any]:
    """Return a cached node item marked stale."""
    node = cached_node.copy()
    status, reason = node_status(discovered=False, stale=True)
    node['status'] = status
    node['reason'] = reason
    node['last_updated'] = updated_at
    return node
