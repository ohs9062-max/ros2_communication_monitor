from pathlib import Path

import pytest

from ros2_dashboard_backend.interface_lab.management.registry import (
    InterfaceUploadError,
    backend_workspace_root,
    default_interface_package,
    default_registry_path,
    parse_interface,
    register_interface,
    registry_snapshot,
)


@pytest.fixture(autouse=True)
def interface_package(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    package = tmp_path / 'src' / 'test_interfaces'
    package.mkdir(parents=True)
    (package / 'CMakeLists.txt').write_text(
        'cmake_minimum_required(VERSION 3.8)\n'
        'project(test_interfaces)\n'
        'find_package(rosidl_default_generators REQUIRED)\n'
        'rosidl_generate_interfaces(${PROJECT_NAME}\n)\n',
        encoding='utf-8',
    )
    (package / 'package.xml').write_text(
        '<package format="3">\n'
        '  <name>test_interfaces</name>\n'
        '  <version>0.0.0</version>\n'
        '  <description>test</description>\n'
        '  <maintainer email="test@example.com">test</maintainer>\n'
        '  <license>Apache-2.0</license>\n'
        '  <export></export>\n'
        '</package>\n',
        encoding='utf-8',
    )
    monkeypatch.setenv('INTERFACE_PACKAGE_NAME', 'test_interfaces')
    monkeypatch.setenv('INTERFACE_PACKAGE_PATH', str(package))
    return package


def test_parse_message_fields_and_constant():
    parsed = parse_interface(
        '# comment\nbool success\nuint8 MODE=1\nstring label default\n',
        'msg',
    )

    assert parsed['fields'][0]['name'] == 'success'
    assert parsed['fields'][1]['is_constant'] is True
    assert parsed['fields'][2]['default'] == 'default'


def test_default_registry_paths_stay_backend_workspace_relative(monkeypatch):
    monkeypatch.delenv('INTERFACE_REGISTRY_PATH', raising=False)
    monkeypatch.delenv('INTERFACE_PACKAGE_PATH', raising=False)
    monkeypatch.delenv('INTERFACE_PACKAGE_NAME', raising=False)

    workspace = backend_workspace_root()
    package_name, package_path = default_interface_package()

    assert workspace.name == 'backend'
    assert default_registry_path() == workspace / 'config' / 'interface_registry.yaml'
    assert package_name == 'ros2_dashboard_interfaces'
    assert package_path == (workspace / 'src' / 'ros2_dashboard_interfaces').resolve()


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


def test_registers_file_cmake_package_and_dependencies(
    tmp_path: Path, interface_package: Path,
):
    entry = register_interface(
        'ScheduleCrud.srv',
        b'rths_interfaces/CleaningSchedule[] items\n---\nbool success\n',
        tmp_path / 'registry.yaml',
    )

    assert (interface_package / 'srv' / 'ScheduleCrud.srv').is_file()
    assert '"srv/ScheduleCrud.srv"' in (
        interface_package / 'CMakeLists.txt'
    ).read_text(encoding='utf-8')
    assert 'find_package(rths_interfaces REQUIRED)' in (
        interface_package / 'CMakeLists.txt'
    ).read_text(encoding='utf-8')
    assert '<depend>rths_interfaces</depend>' in (
        interface_package / 'package.xml'
    ).read_text(encoding='utf-8')
    assert entry['build']['dependency_candidates'] == ['rths_interfaces']
    assert entry['build']['rebuild_required'] is True
    assert entry['build']['import_available'] is False


def test_existing_interface_is_updated_without_duplicate_cmake(
    tmp_path: Path, interface_package: Path,
):
    registry = tmp_path / 'registry.yaml'
    register_interface('Status.msg', b'bool first\n', registry)
    entry = register_interface('Status.msg', b'bool second\n', registry)

    cmake = (interface_package / 'CMakeLists.txt').read_text(encoding='utf-8')
    assert cmake.count('msg/Status.msg') == 1
    assert entry['status'] == 'updated'
    assert (interface_package / 'CMakeLists.txt.bak').is_file()
    assert (interface_package / 'package.xml.bak').is_file()


def test_rejects_invalid_ros_interface_type_name(tmp_path: Path):
    with pytest.raises(InterfaceUploadError):
        register_interface('bad_name.msg', b'bool ok\n', tmp_path / 'registry.yaml')
