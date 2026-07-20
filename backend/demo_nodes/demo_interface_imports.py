#!/usr/bin/env python3

"""Import demo ROS interfaces from uploaded packages when available."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]


def import_demo_interface(kind: str, type_name: str, fallback_packages: list[str]):
    """Import an interface class, preferring uploaded interface packages."""
    _add_workspace_install_paths()
    errors: list[str] = []
    for package_name in [
        *_uploaded_packages_for(kind, type_name),
        *fallback_packages,
    ]:
        try:
            module = importlib.import_module(f'{package_name}.{kind}')
            return getattr(module, type_name)
        except (ImportError, AttributeError) as exc:
            errors.append(f'{package_name}/{kind}/{type_name}: {exc}')
    raise ImportError(
        f'{kind}/{type_name} interface를 import할 수 없습니다. '
        f'업로드 후 backend에서 colcon build 및 source install/setup.bash를 확인하세요. '
        f'시도: {"; ".join(errors)}'
    )


def _add_workspace_install_paths() -> None:
    install_root = WORKSPACE_ROOT / 'install'
    if not install_root.is_dir():
        return
    for path in sorted(install_root.glob('*/lib/python*/site-packages')):
        if path.is_dir():
            value = str(path)
            if value not in sys.path:
                sys.path.insert(0, value)
    importlib.invalidate_caches()


def _uploaded_packages_for(kind: str, type_name: str) -> list[str]:
    registry_path = WORKSPACE_ROOT / 'config' / 'interface_packages.yaml'
    if not registry_path.is_file():
        return []
    try:
        import yaml

        data = yaml.safe_load(registry_path.read_text(encoding='utf-8')) or {}
    except Exception:
        return []

    package_names: list[str] = []
    for package in data.get('packages', []):
        interfaces = package.get('interfaces', {}) if isinstance(package, dict) else {}
        items = interfaces.get(kind, []) if isinstance(interfaces, dict) else []
        if any(item.get('type_name') == type_name for item in items if isinstance(item, dict)):
            name = package.get('name')
            if isinstance(name, str) and name:
                package_names.append(name)
    return package_names
