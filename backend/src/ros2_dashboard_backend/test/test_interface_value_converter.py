import pytest

from ros2_dashboard_backend.interface_value_converter import (
    InterfaceValidationError,
    build_ros_message,
    ros_message_to_json,
)


def test_schedule_crud_request_converts_custom_message_array():
    from rths_interfaces.msg import CleaningSchedule
    from rths_interfaces.srv import ScheduleCrud

    empty = build_ros_message(
        ScheduleCrud.Request,
        {
            'cmd': 5,
            'table_name': 'cleaning_schedule',
            'items': [],
            'only_active': True,
            'where': '',
            'options': '',
        },
        label='request',
    )
    assert empty.items == []

    request = build_ros_message(
        ScheduleCrud.Request,
        {
            'cmd': 1,
            'table_name': 'cleaning_schedule',
            'items': [{
                'scheduling_id': 7,
                'scheduling_dt': '2026-07-16 10:00:00',
                'count': 3,
                'is_active': True,
            }],
            'only_active': False,
            'where': '',
            'options': '',
        },
        label='request',
    )

    assert isinstance(request.items[0], CleaningSchedule)
    assert request.items[0].scheduling_id == 7
    assert request.items[0].count == 3


@pytest.mark.parametrize(
    'payload, message',
    [
        ({'items': 'bad'}, 'expected list'),
        ({'items': ['bad']}, 'expected object'),
        ({'items': [{'abc': 1}]}, 'unknown field'),
        ({'cmd': 'abc'}, 'expected integer'),
    ],
)
def test_schedule_crud_request_validation_errors(payload, message):
    from rths_interfaces.srv import ScheduleCrud

    data = {
        'cmd': 5,
        'table_name': 'cleaning_schedule',
        'items': [],
        'only_active': True,
        'where': '',
        'options': '',
    }
    data.update(payload)

    with pytest.raises(InterfaceValidationError) as exc:
        build_ros_message(ScheduleCrud.Request, data, label='request')
    assert message in '; '.join(exc.value.details).lower()


def test_response_custom_message_array_converts_to_json():
    from rths_interfaces.msg import CleaningSchedule
    from rths_interfaces.srv import ScheduleCrud

    response = ScheduleCrud.Response()
    item = CleaningSchedule()
    item.scheduling_id = 9
    item.scheduling_dt = '2026-07-16'
    item.count = 2
    item.is_active = True
    response.success = True
    response.message = 'ok'
    response.items = [item]

    assert ros_message_to_json(response) == {
        'success': True,
        'message': 'ok',
        'items': [{
            'scheduling_id': 9,
            'scheduling_dt': '2026-07-16',
            'count': 2,
            'is_active': True,
        }],
    }
