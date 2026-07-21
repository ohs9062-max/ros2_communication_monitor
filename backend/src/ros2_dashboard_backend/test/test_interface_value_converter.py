import pytest

from ros2_dashboard_backend.interface_lab.common.value_converter import (
    InterfaceValidationError,
    build_ros_message,
    ros_message_to_json,
    schema_from_message_class,
    schema_from_message_type,
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


def test_schema_helpers_preserve_public_field_shape():
    from rths_interfaces.srv import ScheduleCrud

    request_schema = schema_from_message_class(ScheduleCrud.Request)
    message_schema = schema_from_message_type('rths_interfaces/msg/CleaningSchedule')

    assert {'name': 'cmd', 'type': 'uint8', 'raw_line': 'uint8 cmd'} in request_schema
    assert {
        'name': 'is_active',
        'type': 'boolean',
        'raw_line': 'boolean is_active',
    } in message_schema


def test_integer_validation_rejects_bool_and_uint8_range():
    from rths_interfaces.srv import ScheduleCrud

    valid = {
        'cmd': 5,
        'table_name': 'cleaning_schedule',
        'items': [],
        'only_active': True,
        'where': '',
        'options': '',
    }

    with pytest.raises(InterfaceValidationError) as bool_exc:
        build_ros_message(ScheduleCrud.Request, {**valid, 'cmd': True}, label='request')
    assert 'expected integer' in '; '.join(bool_exc.value.details).lower()

    with pytest.raises(InterfaceValidationError) as range_exc:
        build_ros_message(ScheduleCrud.Request, {**valid, 'cmd': 256}, label='request')
    assert 'expected 0..255' in '; '.join(range_exc.value.details).lower()
