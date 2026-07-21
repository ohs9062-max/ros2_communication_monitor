from pathlib import Path
from zipfile import ZipFile

import yaml

from ros2_dashboard_backend.interface_lab.management.packages import (
    backend_workspace_root,
    default_packages_registry_path,
    default_uploaded_packages_root,
    packages_snapshot,
    upload_interface_package,
    upload_interface_package_folder,
)


def test_package_upload_stays_independent_from_dashboard_interfaces(
    tmp_path: Path,
    monkeypatch,
):
    dashboard_package = tmp_path / 'src' / 'ros2_dashboard_interfaces'
    dashboard_package.mkdir(parents=True)
    dashboard_cmake = dashboard_package / 'CMakeLists.txt'
    dashboard_xml = dashboard_package / 'package.xml'
    dashboard_cmake.write_text(
        'cmake_minimum_required(VERSION 3.8)\n'
        'project(ros2_dashboard_interfaces)\n'
        'find_package(rosidl_default_generators REQUIRED)\n'
        'rosidl_generate_interfaces(${PROJECT_NAME}\n'
        '  "msg/KeyValue.msg"\n'
        '  "msg/MonitorStatus.msg"\n'
        ')\n',
        encoding='utf-8',
    )
    dashboard_xml.write_text(
        '<package format="3">\n'
        '  <name>ros2_dashboard_interfaces</name>\n'
        '</package>\n',
        encoding='utf-8',
    )
    original_cmake = dashboard_cmake.read_text(encoding='utf-8')
    original_xml = dashboard_xml.read_text(encoding='utf-8')

    uploaded_root = tmp_path / 'src' / 'uploaded_interface_packages'
    package_registry_path = tmp_path / 'config' / 'interface_packages.yaml'
    single_registry_path = tmp_path / 'config' / 'interface_registry.yaml'
    monkeypatch.setenv('INTERFACE_PACKAGE_PATH', str(dashboard_package))
    monkeypatch.setenv('INTERFACE_UPLOADED_PACKAGES_PATH', str(uploaded_root))
    monkeypatch.setenv('INTERFACE_PACKAGES_REGISTRY_PATH', str(package_registry_path))
    monkeypatch.setenv('INTERFACE_REGISTRY_PATH', str(single_registry_path))

    zip_path = tmp_path / 'rths_interfaces.zip'
    with ZipFile(zip_path, 'w') as archive:
        archive.writestr(
            'rths_interfaces/package.xml',
            '<package format="3"><name>rths_interfaces</name></package>\n',
        )
        archive.writestr(
            'rths_interfaces/CMakeLists.txt',
            'cmake_minimum_required(VERSION 3.8)\n'
            'project(rths_interfaces)\n'
            'find_package(rosidl_default_generators REQUIRED)\n'
            'rosidl_generate_interfaces(${PROJECT_NAME}\n'
            '  "msg/CleaningSchedule.msg"\n'
            '  "srv/RobotControl.srv"\n'
            '  "srv/ScheduleCrud.srv"\n'
            '  "action/CanControl.action"\n'
            ')\n',
        )
        archive.writestr(
            'rths_interfaces/msg/CleaningSchedule.msg',
            'uint32 scheduling_id\n',
        )
        archive.writestr(
            'rths_interfaces/srv/RobotControl.srv',
            'uint8 cmd\n---\nbool success\n',
        )
        archive.writestr(
            'rths_interfaces/srv/ScheduleCrud.srv',
            'rths_interfaces/CleaningSchedule[] items\n---\nbool success\n',
        )
        archive.writestr(
            'rths_interfaces/action/CanControl.action',
            'uint8 node_id\n---\nbool success\n---\nstring stage\n',
        )

    entry = upload_interface_package(zip_path.name, zip_path.read_bytes())

    assert entry['name'] == 'rths_interfaces'
    uploaded_package = uploaded_root / 'rths_interfaces'
    assert uploaded_package.is_dir()
    assert (uploaded_package / 'package.xml').is_file()
    assert (uploaded_package / 'msg' / 'CleaningSchedule.msg').is_file()
    assert (uploaded_package / 'srv' / 'RobotControl.srv').is_file()
    assert (uploaded_package / 'srv' / 'ScheduleCrud.srv').is_file()
    assert (uploaded_package / 'action' / 'CanControl.action').is_file()

    assert not (dashboard_package / 'msg' / 'CleaningSchedule.msg').exists()
    assert not (dashboard_package / 'srv' / 'RobotControl.srv').exists()
    assert not (dashboard_package / 'srv' / 'ScheduleCrud.srv').exists()
    assert not (dashboard_package / 'action' / 'CanControl.action').exists()
    assert dashboard_cmake.read_text(encoding='utf-8') == original_cmake
    assert dashboard_xml.read_text(encoding='utf-8') == original_xml

    assert not single_registry_path.exists()

    package_registry = packages_snapshot()
    assert [item['name'] for item in package_registry['packages']] == ['rths_interfaces']
    saved = yaml.safe_load(package_registry_path.read_text(encoding='utf-8'))
    assert saved['packages'][0]['path'].endswith(
        'src/uploaded_interface_packages/rths_interfaces',
    )


def test_default_package_paths_stay_backend_workspace_relative(monkeypatch):
    monkeypatch.delenv('INTERFACE_PACKAGES_REGISTRY_PATH', raising=False)
    monkeypatch.delenv('INTERFACE_UPLOADED_PACKAGES_PATH', raising=False)

    workspace = backend_workspace_root()

    assert workspace.name == 'backend'
    assert default_packages_registry_path() == workspace / 'config' / 'interface_packages.yaml'
    assert default_uploaded_packages_root() == workspace / 'src' / 'uploaded_interface_packages'


def test_package_folder_upload_restores_tree_without_single_registry(
    tmp_path: Path,
    monkeypatch,
):
    dashboard_package = tmp_path / 'src' / 'ros2_dashboard_interfaces'
    dashboard_package.mkdir(parents=True)
    dashboard_cmake = dashboard_package / 'CMakeLists.txt'
    dashboard_xml = dashboard_package / 'package.xml'
    dashboard_cmake.write_text(
        'cmake_minimum_required(VERSION 3.8)\n'
        'project(ros2_dashboard_interfaces)\n'
        'rosidl_generate_interfaces(${PROJECT_NAME}\n'
        '  "msg/KeyValue.msg"\n'
        ')\n',
        encoding='utf-8',
    )
    dashboard_xml.write_text(
        '<package format="3">\n'
        '  <name>ros2_dashboard_interfaces</name>\n'
        '</package>\n',
        encoding='utf-8',
    )
    original_cmake = dashboard_cmake.read_text(encoding='utf-8')
    original_xml = dashboard_xml.read_text(encoding='utf-8')

    uploaded_root = tmp_path / 'src' / 'uploaded_interface_packages'
    package_registry_path = tmp_path / 'config' / 'interface_packages.yaml'
    single_registry_path = tmp_path / 'config' / 'interface_registry.yaml'
    monkeypatch.setenv('INTERFACE_PACKAGE_PATH', str(dashboard_package))
    monkeypatch.setenv('INTERFACE_UPLOADED_PACKAGES_PATH', str(uploaded_root))
    monkeypatch.setenv('INTERFACE_PACKAGES_REGISTRY_PATH', str(package_registry_path))
    monkeypatch.setenv('INTERFACE_REGISTRY_PATH', str(single_registry_path))

    files = [
        (
            'rths_interfaces/package.xml',
            b'<package format="3"><name>rths_interfaces</name></package>\n',
        ),
        (
            'rths_interfaces/CMakeLists.txt',
            b'cmake_minimum_required(VERSION 3.8)\n'
            b'project(rths_interfaces)\n'
            b'rosidl_generate_interfaces(${PROJECT_NAME}\n'
            b'  "msg/CleaningSchedule.msg"\n'
            b'  "srv/RobotControl.srv"\n'
            b'  "srv/ScheduleCrud.srv"\n'
            b'  "action/CanControl.action"\n'
            b')\n',
        ),
        ('rths_interfaces/msg/CleaningSchedule.msg', b'uint32 scheduling_id\n'),
        ('rths_interfaces/srv/RobotControl.srv', b'uint8 cmd\n---\nbool success\n'),
        (
            'rths_interfaces/srv/ScheduleCrud.srv',
            b'CleaningSchedule[] items\n---\nbool success\n',
        ),
        (
            'rths_interfaces/action/CanControl.action',
            b'uint8 node_id\n---\nbool success\n---\nstring stage\n',
        ),
    ]

    entry = upload_interface_package_folder(files)

    assert entry['name'] == 'rths_interfaces'
    uploaded_package = uploaded_root / 'rths_interfaces'
    assert (uploaded_package / 'package.xml').is_file()
    assert (uploaded_package / 'CMakeLists.txt').is_file()
    assert (uploaded_package / 'msg' / 'CleaningSchedule.msg').is_file()
    assert (uploaded_package / 'srv' / 'RobotControl.srv').is_file()
    assert (uploaded_package / 'srv' / 'ScheduleCrud.srv').is_file()
    assert (uploaded_package / 'action' / 'CanControl.action').is_file()

    assert not (dashboard_package / 'msg' / 'CleaningSchedule.msg').exists()
    assert not (dashboard_package / 'srv' / 'RobotControl.srv').exists()
    assert not (dashboard_package / 'srv' / 'ScheduleCrud.srv').exists()
    assert not (dashboard_package / 'action' / 'CanControl.action').exists()
    assert dashboard_cmake.read_text(encoding='utf-8') == original_cmake
    assert dashboard_xml.read_text(encoding='utf-8') == original_xml
    assert not single_registry_path.exists()

    saved = yaml.safe_load(package_registry_path.read_text(encoding='utf-8'))
    assert [item['name'] for item in saved['packages']] == ['rths_interfaces']
    assert saved['packages'][0]['path'].endswith(
        'src/uploaded_interface_packages/rths_interfaces',
    )
