import pytest

from ros2_dashboard_backend.interface_lab.execution.service_call_runtime import ServiceCallRuntime


def test_validation_error_does_not_create_service_client(monkeypatch):
    from rths_interfaces.srv import ScheduleCrud
    import ros2_dashboard_backend.interface_lab.execution.service_call_runtime as call_runtime

    runtime = ServiceCallRuntime(lock=None, node_getter=lambda: object())
    runtime._lock = _NoopLock()
    runtime._allowed_service = lambda service_name, service_type: {
        'name': service_name,
        'type': service_type,
        'server_count': 1,
    }
    monkeypatch.setattr(
        call_runtime,
        'load_service_class',
        lambda service_type: ScheduleCrud,
    )

    def fail_client(*args, **kwargs):
        raise AssertionError('client must not be created on validation error')

    runtime._client = fail_client

    result = runtime.call_service(
        service_name='/ScheduleCrud',
        service_type='rths_interfaces/srv/ScheduleCrud',
        request_data={
            'cmd': 'abc',
            'table_name': 'cleaning_schedule',
            'items': [],
            'only_active': True,
            'where': '',
            'options': '',
        },
        timeout_sec=1.0,
    )

    assert result['success'] is False
    assert result['called'] is False
    assert result['sent_to_server'] is False
    assert result['error_type'] == 'validation_error'
    assert runtime.history()['calls'][0]['error_type'] == 'validation_error'


class _NoopLock:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False
