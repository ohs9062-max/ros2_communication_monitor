from pathlib import Path

import pytest

from ros2_dashboard_backend.interface_registry import (
    InterfaceUploadError,
    parse_interface,
    register_interface,
    registry_snapshot,
)


def test_parse_message_fields_and_constant():
    parsed = parse_interface(
        '# comment\nbool success\nuint8 MODE=1\nstring label default\n',
        'msg',
    )

    assert parsed['fields'][0]['name'] == 'success'
    assert parsed['fields'][1]['is_constant'] is True
    assert parsed['fields'][2]['default'] == 'default'


def test_parse_service_and_action_sections():
    service = parse_interface('uint8 cmd\n---\nbool success\n', 'srv')
    action = parse_interface(
        'uint8 value\n---\nbool success\n---\nstring status\n',
        'action',
    )

    assert service['request'][0]['name'] == 'cmd'
    assert service['response'][0]['name'] == 'success'
    assert action['goal'][0]['name'] == 'value'
    assert action['result'][0]['name'] == 'success'
    assert action['feedback'][0]['name'] == 'status'


def test_invalid_sections_are_saved_with_parse_error(tmp_path: Path):
    path = tmp_path / 'interface_registry.yaml'
    entry = register_interface('Bad.srv', b'uint8 cmd\n', path)

    assert entry['raw_text'] == 'uint8 cmd\n'
    assert entry['parsed'] == {}
    assert entry['parsed_error']


def test_same_kind_and_safe_file_name_are_upserted(tmp_path: Path):
    path = tmp_path / 'interface_registry.yaml'
    register_interface('../Status.msg', b'bool first\n', path)
    register_interface('Status.msg', b'bool second\n', path)

    messages = registry_snapshot(path)['interface_registry']['messages']
    assert len(messages) == 1
    assert messages[0]['file_name'] == 'Status.msg'
    assert messages[0]['parsed']['fields'][0]['name'] == 'second'


def test_rejects_unsupported_extension(tmp_path: Path):
    with pytest.raises(InterfaceUploadError):
        register_interface('Status.txt', b'bool ok\n', tmp_path / 'registry.yaml')
