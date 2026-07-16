from pathlib import Path

import pytest

from ros2_dashboard_backend import manual_interfaces
from ros2_dashboard_backend.interface_registry import InterfaceUploadError
from ros2_dashboard_backend.interface_registry import registry_snapshot


def test_manual_type_registration_does_not_create_files(tmp_path, monkeypatch):
    registry_path = tmp_path / 'config' / 'interface_registry.yaml'
    monkeypatch.setenv('INTERFACE_REGISTRY_PATH', str(registry_path))
    monkeypatch.setattr(
        manual_interfaces,
        '_check_import',
        lambda package, kind, type_name: (package == 'rths_interfaces', None),
    )

    entry = manual_interfaces.register_manual_type(
        full_type='rths_interfaces/srv/ScheduleCrud',
        registry_path=registry_path,
    )

    assert entry['source'] == 'manual_type'
    assert entry['build']['file_saved'] is False
    assert entry['build']['cmake_registered'] is False
    assert entry['build']['rebuild_required'] is False
    services = registry_snapshot(registry_path)['interface_registry']['services']
    assert services[0]['full_type'] == 'rths_interfaces/srv/ScheduleCrud'


def test_manual_definition_creates_uploaded_interfaces_package(tmp_path, monkeypatch):
    registry_path = tmp_path / 'config' / 'interface_registry.yaml'
    monkeypatch.setenv('INTERFACE_REGISTRY_PATH', str(registry_path))
    monkeypatch.setattr(manual_interfaces, 'backend_workspace_root', lambda: tmp_path)
    monkeypatch.setattr(manual_interfaces, '_check_import', lambda *_args: (False, 'not built yet'))

    entry = manual_interfaces.write_manual_definition(
        package='uploaded_interfaces',
        kind='srv',
        type_name='MyControl',
        definition='uint8 cmd\n---\nbool success\n',
        registry_path=registry_path,
    )

    package_root = tmp_path / 'src' / 'uploaded_interfaces'
    assert entry['source'] == 'manual_definition'
    assert (package_root / 'package.xml').is_file()
    assert (package_root / 'CMakeLists.txt').is_file()
    assert (package_root / 'srv' / 'MyControl.srv').read_text() == 'uint8 cmd\n---\nbool success\n'
    assert 'srv/MyControl.srv' in (package_root / 'CMakeLists.txt').read_text()
    assert not (tmp_path / 'src' / 'ros2_dashboard_interfaces').exists()


def test_invalid_msg_separator_does_not_create_files(tmp_path, monkeypatch):
    registry_path = tmp_path / 'config' / 'interface_registry.yaml'
    monkeypatch.setattr(manual_interfaces, 'backend_workspace_root', lambda: tmp_path)

    with pytest.raises(InterfaceUploadError):
        manual_interfaces.write_manual_definition(
            package='uploaded_interfaces',
            kind='msg',
            type_name='BadMsg',
            definition='uint8 cmd\n---\nbool success\n',
            registry_path=registry_path,
        )

    assert not (tmp_path / 'src' / 'uploaded_interfaces' / 'msg' / 'BadMsg.msg').exists()
    assert not (tmp_path / 'src' / 'uploaded_interfaces' / 'CMakeLists.txt').exists()


def test_invalid_primitive_does_not_create_files(tmp_path, monkeypatch):
    registry_path = tmp_path / 'config' / 'interface_registry.yaml'
    monkeypatch.setattr(manual_interfaces, 'backend_workspace_root', lambda: tmp_path)

    with pytest.raises(InterfaceUploadError):
        manual_interfaces.write_manual_definition(
            package='uploaded_interfaces',
            kind='msg',
            type_name='BadMsg',
            definition='unint8 cmd\n',
            registry_path=registry_path,
        )

    assert not (tmp_path / 'src' / 'uploaded_interfaces' / 'msg' / 'BadMsg.msg').exists()


def test_invalid_srv_and_action_separators(tmp_path, monkeypatch):
    registry_path = tmp_path / 'config' / 'interface_registry.yaml'
    monkeypatch.setattr(manual_interfaces, 'backend_workspace_root', lambda: tmp_path)

    with pytest.raises(InterfaceUploadError):
        manual_interfaces.write_manual_definition(
            package='uploaded_interfaces',
            kind='srv',
            type_name='BadSrv',
            definition='uint8 cmd\nbool success\n',
            registry_path=registry_path,
        )
    with pytest.raises(InterfaceUploadError):
        manual_interfaces.write_manual_definition(
            package='uploaded_interfaces',
            kind='action',
            type_name='BadAction',
            definition='uint8 cmd\n---\nbool success\n',
            registry_path=registry_path,
        )


def test_update_failure_keeps_existing_file(tmp_path, monkeypatch):
    registry_path = tmp_path / 'config' / 'interface_registry.yaml'
    monkeypatch.setenv('INTERFACE_REGISTRY_PATH', str(registry_path))
    monkeypatch.setattr(manual_interfaces, 'backend_workspace_root', lambda: tmp_path)
    monkeypatch.setattr(manual_interfaces, '_check_import', lambda *_args: (False, 'not built yet'))
    manual_interfaces.write_manual_definition(
        package='uploaded_interfaces',
        kind='srv',
        type_name='MyControl',
        definition='uint8 cmd\n---\nbool success\n',
        registry_path=registry_path,
    )
    target = tmp_path / 'src' / 'uploaded_interfaces' / 'srv' / 'MyControl.srv'

    with pytest.raises(InterfaceUploadError):
        manual_interfaces.update_manual_definition(
            kind='srv',
            type_name='MyControl',
            definition='uint8 cmd\nbool success\n',
            registry_path=registry_path,
        )

    assert target.read_text() == 'uint8 cmd\n---\nbool success\n'


def test_delete_manual_definition_removes_file_and_cmake_entry(tmp_path, monkeypatch):
    registry_path = tmp_path / 'config' / 'interface_registry.yaml'
    monkeypatch.setenv('INTERFACE_REGISTRY_PATH', str(registry_path))
    monkeypatch.setattr(manual_interfaces, 'backend_workspace_root', lambda: tmp_path)
    monkeypatch.setattr(manual_interfaces, '_check_import', lambda *_args: (False, 'not built yet'))
    manual_interfaces.write_manual_definition(
        package='uploaded_interfaces',
        kind='srv',
        type_name='MyControl',
        definition='uint8 cmd\n---\nbool success\n',
        registry_path=registry_path,
    )

    result = manual_interfaces.delete_manual_definition(
        kind='srv',
        type_name='MyControl',
        registry_path=registry_path,
    )

    package_root = tmp_path / 'src' / 'uploaded_interfaces'
    assert result['deleted_file'] is True
    assert not (package_root / 'srv' / 'MyControl.srv').exists()
    assert 'srv/MyControl.srv' not in (package_root / 'CMakeLists.txt').read_text()
    assert registry_snapshot(registry_path)['interface_registry']['services'] == []
