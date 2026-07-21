from pathlib import Path

from ros2_dashboard_backend.interface_lab.apply.runtime import (
    backend_workspace_path,
    cleanup_uploaded_package_build_artifacts,
    default_apply_log_path,
    default_apply_status_path,
    duplicate_workspace_packages,
    reload_trigger_path,
)


def test_cleanup_uploaded_package_build_artifacts_is_package_scoped(tmp_path: Path):
    workspace = tmp_path / 'backend'
    targets = [
        workspace / 'build' / 'rths_interfaces',
        workspace / 'install' / 'rths_interfaces',
        workspace / 'log' / 'latest' / 'rths_interfaces',
        workspace / 'log' / 'latest_build' / 'rths_interfaces',
    ]
    for target in targets:
        target.mkdir(parents=True)
        (target / 'stale.txt').write_text('stale', encoding='utf-8')
    keep = workspace / 'build' / 'ros2_dashboard_interfaces'
    keep.mkdir(parents=True)
    (keep / 'keep.txt').write_text('keep', encoding='utf-8')

    result = cleanup_uploaded_package_build_artifacts(workspace, ['rths_interfaces'])

    assert sorted(result['removed']) == sorted([
        'build/rths_interfaces',
        'install/rths_interfaces',
        'log/latest/rths_interfaces',
        'log/latest_build/rths_interfaces',
    ])
    assert all(not target.exists() for target in targets)
    assert (keep / 'keep.txt').is_file()


def test_default_apply_paths_stay_backend_workspace_relative(monkeypatch):
    monkeypatch.delenv('INTERFACE_APPLY_STATUS_PATH', raising=False)
    monkeypatch.delenv('INTERFACE_APPLY_LOG_PATH', raising=False)

    workspace = backend_workspace_path()

    assert workspace.name == 'backend'
    assert default_apply_status_path() == workspace / 'config' / 'interface_apply_status.yaml'
    assert default_apply_log_path() == workspace / 'config' / 'interface_apply_last.log'
    assert reload_trigger_path() == (
        workspace
        / 'src'
        / 'ros2_dashboard_backend'
        / 'ros2_dashboard_backend'
        / 'reload_trigger.py'
    )


def test_duplicate_workspace_packages_reports_selected_package(tmp_path: Path):
    workspace = tmp_path / 'backend'
    first = workspace / 'src' / 'uploaded_interface_packages' / 'rths_interfaces'
    second = workspace / 'src' / 'other' / 'rths_interfaces'
    third = workspace / 'src' / 'ros2_dashboard_interfaces'
    for package in (first, second, third):
        package.mkdir(parents=True)
    (first / 'package.xml').write_text(
        '<package format="3"><name>rths_interfaces</name></package>',
        encoding='utf-8',
    )
    (second / 'package.xml').write_text(
        '<package format="3"><name>rths_interfaces</name></package>',
        encoding='utf-8',
    )
    (third / 'package.xml').write_text(
        '<package format="3"><name>ros2_dashboard_interfaces</name></package>',
        encoding='utf-8',
    )

    duplicates = duplicate_workspace_packages(workspace, ['rths_interfaces'])

    assert duplicates == {
        'rths_interfaces': [
            'src/other/rths_interfaces',
            'src/uploaded_interface_packages/rths_interfaces',
        ],
    }
