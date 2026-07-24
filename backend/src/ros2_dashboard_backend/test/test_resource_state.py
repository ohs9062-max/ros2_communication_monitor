from ros2_dashboard_backend.action.models import action_meta
from ros2_dashboard_backend.node.models import node_meta
from ros2_dashboard_backend.resource_state import (
    disconnected_resource,
    mark_graph_present,
)
from ros2_dashboard_backend.service.models import service_meta


def test_graph_resource_transitions_from_present_to_disconnected() -> None:
    present = mark_graph_present(
        {
            'name': '/demo',
            'status': 'active',
            'publisher_count': 1,
        },
        observed_at=100.0,
    )
    disconnected = disconnected_resource(
        present,
        detected_at=105.0,
        count_fields=('publisher_count',),
    )

    assert present['graph_present'] is True
    assert present['ever_discovered'] is True
    assert present['last_seen_at'] == 100.0
    assert disconnected['status'] == 'disconnected'
    assert disconnected['graph_present'] is False
    assert disconnected['disconnected_at'] == 105.0
    assert disconnected['last_seen_at'] == 100.0
    assert disconnected['publisher_count'] == 0


def test_disconnected_is_error_but_unknown_is_neutral_in_meta() -> None:
    services = [
        {'status': 'unknown', 'hidden_by_default': False},
        {'status': 'disconnected', 'hidden_by_default': False},
    ]
    actions = [
        {'status': 'unknown'},
        {'status': 'disconnected'},
    ]
    nodes = [
        {'status': 'unknown'},
        {'status': 'disconnected'},
    ]

    assert service_meta(
        services=services,
        last_updated=1.0,
    )['error_count'] == 1
    assert action_meta(
        actions=actions,
        last_updated=1.0,
    )['error_count'] == 1
    assert node_meta(
        nodes=nodes,
        last_updated=1.0,
    )['error_count'] == 1
