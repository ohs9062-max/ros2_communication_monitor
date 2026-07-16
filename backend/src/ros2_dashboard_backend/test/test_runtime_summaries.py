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


class _NoopLock:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False
