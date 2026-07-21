from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[4]
BACKEND_PACKAGE_ROOT = PROJECT_ROOT / 'backend' / 'src' / 'ros2_dashboard_backend'
PYTHON_PACKAGE_ROOT = BACKEND_PACKAGE_ROOT / 'ros2_dashboard_backend'


def test_legacy_interface_lab_import_paths_are_not_used_in_backend_code():
    legacy_paths = [
        'ros2_dashboard_backend.' + 'interface_apply',
        'ros2_dashboard_backend.' + 'interface_registry',
        'ros2_dashboard_backend.' + 'interface_packages',
        'ros2_dashboard_backend.' + 'manual_interfaces',
        'ros2_dashboard_backend.' + 'interface_receive_runtime',
        'ros2_dashboard_backend.' + 'interface_value_converter',
        'ros2_dashboard_backend.service.' + 'call_runtime',
        'ros2_dashboard_backend.action.' + 'goal_runtime',
    ]
    files = [
        path for path in PYTHON_PACKAGE_ROOT.rglob('*.py')
        if '__pycache__' not in path.parts
    ]

    hits = []
    for path in files:
        text = path.read_text(encoding='utf-8')
        for legacy_path in legacy_paths:
            if legacy_path in text:
                hits.append(f'{path.relative_to(PROJECT_ROOT)}: {legacy_path}')

    assert hits == []


def test_demo_console_scripts_point_to_installed_backend_modules():
    setup_py = BACKEND_PACKAGE_ROOT / 'setup.py'
    text = setup_py.read_text(encoding='utf-8')
    compact = ''.join(text.split())

    assert 'introspection_add_two_ints_server' in compact
    assert 'ros2_dashboard_backend.service.introspection_test_nodes:server_main' in compact
    assert 'introspection_add_two_ints_client' in compact
    assert 'ros2_dashboard_backend.service.introspection_test_nodes:client_main' in compact
    assert 'test.manual_introspection_test_nodes' not in text
