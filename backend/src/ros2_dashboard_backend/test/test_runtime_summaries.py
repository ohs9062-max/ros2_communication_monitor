from ros2_dashboard_backend.action.goal_runtime import ActionGoalRuntime
from ros2_dashboard_backend.service.call_runtime import ServiceCallRuntime


def test_service_history_summary_includes_validation_not_sent():
    runtime = ServiceCallRuntime(lock=_NoopLock(), node_getter=lambda: None)
    runtime._record_history({
        'success': False,
        'service_name': '/ScheduleCrud',
        'service_type': 'rths_interfaces/srv/ScheduleCrud',
        'request': {'cmd': 'bad'},
        'response': None,
        'elapsed_ms': 1.2,
        'called_at': 10.0,
        'called': False,
        'sent_to_server': False,
        'error_type': 'validation_error',
        'error': 'bad cmd',
        'details': ['request.cmd: expected integer'],
    })

    summary = runtime.summary_by_service()[('/ScheduleCrud', 'rths_interfaces/srv/ScheduleCrud')]

    assert summary['last_call_status'] == 'validation_error'
    assert summary['sent_to_server'] is False
    assert summary['failure_count'] == 1
    assert summary['history'][0]['last_error'] == 'bad cmd'


def test_action_history_summary_includes_result_and_feedback():
    runtime = ActionGoalRuntime(lock=_NoopLock(), node_getter=lambda: None)
    runtime._record_history({
        'success': True,
        'action_name': '/CanControl',
        'action_type': 'rths_interfaces/action/CanControl',
        'goal': {'node_id': 1},
        'accepted': True,
        'feedback': [{'stage': 'sending'}],
        'result': {'success': True},
        'elapsed_ms': 12.0,
        'sent_at': 20.0,
        'sent_to_server': True,
    })

    summary = runtime.summary_by_action()[('/CanControl', 'rths_interfaces/action/CanControl')]

    assert summary['status'] == 'success'
    assert summary['last_feedback_preview'] == {'stage': 'sending'}
    assert summary['last_result_preview'] == {'success': True}
    assert summary['success_count'] == 1


def test_action_graph_preserves_each_type_and_exact_type_counts():
    runtime = ActionGoalRuntime(lock=_NoopLock(), node_getter=lambda: object())
    runtime._action_count_maps = lambda: (
        {
            ('/CanControl', 'can_interfaces/action/CanControl'): 1,
            ('/CanControl', 'rths_interfaces/action/CanControl'): 2,
        },
        {
            ('/CanControl', 'rths_interfaces/action/CanControl'): 1,
        },
    )
    runtime._action_servers_by_node = lambda _name, _namespace: []
    runtime._action_clients_by_node = lambda _name, _namespace: []

    import ros2_dashboard_backend.action.goal_runtime as goal_runtime

    original = goal_runtime.get_action_names_and_types
    goal_runtime.get_action_names_and_types = lambda _node: [
        (
            '/CanControl',
            [
                'can_interfaces/action/CanControl',
                'rths_interfaces/action/CanControl',
            ],
        ),
    ]
    try:
        graph = runtime._action_graph()
    finally:
        goal_runtime.get_action_names_and_types = original

    assert graph == [
        {
            'name': '/CanControl',
            'type': 'can_interfaces/action/CanControl',
            'server_count': 1,
            'client_count': 0,
        },
        {
            'name': '/CanControl',
            'type': 'rths_interfaces/action/CanControl',
            'server_count': 2,
            'client_count': 1,
        },
    ]


def test_action_client_cache_is_keyed_by_name_and_type():
    created = []
    runtime = ActionGoalRuntime(lock=_NoopLock(), node_getter=lambda: object())

    import ros2_dashboard_backend.action.goal_runtime as goal_runtime

    original = goal_runtime.ActionClient
    goal_runtime.ActionClient = lambda _node, action_class, name: created.append(
        (name, action_class),
    ) or object()
    try:
        rths_client = runtime._client(
            '/CanControl',
            'rths_interfaces/action/CanControl',
            'rths-class',
        )
        can_client = runtime._client(
            '/CanControl',
            'can_interfaces/action/CanControl',
            'can-class',
        )
        assert runtime._client(
            '/CanControl',
            'rths_interfaces/action/CanControl',
            'rths-class',
        ) is rths_client
    finally:
        goal_runtime.ActionClient = original

    assert rths_client is not can_client
    assert created == [
        ('/CanControl', 'rths-class'),
        ('/CanControl', 'can-class'),
    ]


class _NoopLock:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False
