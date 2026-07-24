"""Backend 설정 로딩의 config_loader 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from ros2_dashboard_backend.topic.models import SUPPORTED_PREVIEW_TYPES

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None


LOGGER = logging.getLogger(__name__)

DEFAULT_CORS_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
]

DEFAULT_TOPIC_EXCLUDES = (
    '/parameter_events',
    '/rosout',
    '/tf',
    '/tf_static',
    '/clock',
)

DEFAULT_SUPPORTED_TOPIC_TYPES = SUPPORTED_PREVIEW_TYPES


@dataclass(frozen=True)
class ServiceActiveCheckTarget:
    """Backend 설정 로딩의 ServiceActiveCheckTarget 역할을 담당하는 클래스입니다."""

    name: str
    service_type: str
    timeout_sec: float
    request: dict[str, Any] | None
    success_field: str | None


@dataclass(frozen=True)
class ServiceActiveCheckConfig:
    """Backend 설정 로딩 설정 값을 담는 데이터 클래스입니다."""

    enabled: bool = False
    interval_sec: float = 10.0
    default_timeout_sec: float = 2.0
    allowlist: tuple[ServiceActiveCheckTarget, ...] = ()


@dataclass(frozen=True)
class MonitorConfig:
    """Backend 설정 로딩 설정 값을 담는 데이터 클래스입니다."""

    poll_interval_sec: float = 1.0
    stale_timeout_sec: float = 3.0
    hz_window_sec: float = 5.0
    topics_auto_discover: bool = True
    topics_auto_subscribe_supported_types: bool = True
    topics_include: tuple[str, ...] = ()
    topics_exclude: tuple[str, ...] = DEFAULT_TOPIC_EXCLUDES
    topics_supported_types: tuple[str, ...] = DEFAULT_SUPPORTED_TOPIC_TYPES
    topics_registered_types: tuple[str, ...] = ()
    services_include: tuple[str, ...] = ()
    services_exclude: tuple[str, ...] = ()
    services_active_check: ServiceActiveCheckConfig = field(
        default_factory=ServiceActiveCheckConfig,
    )
    nodes_include: tuple[str, ...] = ()
    nodes_exclude: tuple[str, ...] = ()
    nodes_exclude_prefixes: tuple[str, ...] = ()
    nodes_stale_timeout_sec: float = 5.0
    actions_include: tuple[str, ...] = ()
    actions_exclude: tuple[str, ...] = ()
    actions_exclude_prefixes: tuple[str, ...] = ()
    actions_auto_monitor_status: bool = True
    actions_auto_monitor_feedback: bool = True
    actions_auto_fetch_result_for_observed_goals: bool = True


@dataclass(frozen=True)
class BackendConfig:
    """Backend 설정 로딩 설정 값을 담는 데이터 클래스입니다."""

    cors_origins: tuple[str, ...]
    monitor: MonitorConfig


def load_backend_config() -> BackendConfig:
    """Backend 설정 로딩에서 필요한 ROS2 타입이나 설정을 불러오는 함수입니다."""
    backend_root = _backend_root()
    _load_env(backend_root)

    monitor_config_path = _monitor_config_path(backend_root)
    monitor_data = _load_monitor_yaml(monitor_config_path)
    registered_message_types = _registered_message_types(backend_root)

    return BackendConfig(
        cors_origins=_cors_origins(),
        monitor=_monitor_config(
            monitor_data,
            registered_message_types=registered_message_types,
        ),
    )


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _load_env(backend_root: Path) -> None:
    env_candidates = [
        backend_root / '.env',
        backend_root / 'src' / 'ros2_dashboard_backend' / '.env',
    ]

    for env_path in env_candidates:
        if env_path.is_file():
            load_dotenv(env_path)
            return

    load_dotenv()


def _monitor_config_path(backend_root: Path) -> Path:
    config_path = os.getenv('MONITOR_CONFIG_PATH', 'config/monitor.yaml')
    path = Path(config_path)

    if path.is_absolute():
        return path

    return backend_root / path


def _load_monitor_yaml(config_path: Path) -> dict[str, Any]:
    if not config_path.is_file():
        LOGGER.warning(
            'Monitor config file not found: %s. Using safe defaults.',
            config_path,
        )
        return {}

    if yaml is None:
        LOGGER.warning('PyYAML is not available. Using safe defaults.')
        return {}

    try:
        with config_path.open('r', encoding='utf-8') as config_file:
            data = yaml.safe_load(config_file)
    except yaml.YAMLError as exc:
        LOGGER.warning(
            'Failed to parse monitor config %s: %s. Using safe defaults.',
            config_path,
            exc,
        )
        return {}
    except OSError as exc:
        LOGGER.warning(
            'Failed to read monitor config %s: %s. Using safe defaults.',
            config_path,
            exc,
        )
        return {}

    if isinstance(data, dict):
        return data

    LOGGER.warning(
        'Monitor config %s is not a mapping. Using safe defaults.',
        config_path,
    )
    return {}


def _monitor_config(
    data: dict[str, Any],
    *,
    registered_message_types: tuple[str, ...] = (),
) -> MonitorConfig:
    monitor = _mapping(data.get('monitor'))
    topics = _mapping(data.get('topics'))
    services = _mapping(data.get('services'))
    nodes = _mapping(data.get('nodes'))
    actions = _mapping(data.get('actions'))

    return MonitorConfig(
        poll_interval_sec=_float_value(
            monitor.get('poll_interval_sec'),
            default=1.0,
        ),
        stale_timeout_sec=_float_value(
            monitor.get('stale_timeout_sec'),
            default=3.0,
        ),
        hz_window_sec=_float_value(
            monitor.get('hz_window_sec'),
            default=5.0,
        ),
        topics_auto_discover=_bool_value(
            topics.get('auto_discover'),
            default=True,
        ),
        topics_auto_subscribe_supported_types=_bool_value(
            topics.get('auto_subscribe_supported_types'),
            default=True,
        ),
        topics_include=_config_string_tuple(topics, 'include'),
        topics_exclude=_config_string_tuple(
            topics,
            'exclude',
            default=DEFAULT_TOPIC_EXCLUDES,
        ),
        topics_supported_types=tuple(dict.fromkeys(
            _string_tuple(
                topics.get('supported_types'),
                default=DEFAULT_SUPPORTED_TOPIC_TYPES,
            )
            + registered_message_types,
        )),
        topics_registered_types=tuple(dict.fromkeys(registered_message_types)),
        services_include=_config_string_tuple(services, 'include'),
        services_exclude=_config_string_tuple(services, 'exclude'),
        services_active_check=_service_active_check_config(
            services.get('active_check'),
        ),
        nodes_include=_config_string_tuple(nodes, 'include'),
        nodes_exclude=_config_string_tuple(nodes, 'exclude'),
        nodes_exclude_prefixes=_config_string_tuple(
            nodes,
            'exclude_prefixes',
        ),
        nodes_stale_timeout_sec=_float_value(
            nodes.get('stale_timeout_sec'),
            default=5.0,
        ),
        actions_include=_config_string_tuple(actions, 'include'),
        actions_exclude=_config_string_tuple(actions, 'exclude'),
        actions_exclude_prefixes=_config_string_tuple(
            actions,
            'exclude_prefixes',
        ),
        actions_auto_monitor_status=_bool_value(
            actions.get('auto_monitor_status'),
            default=True,
        ),
        actions_auto_monitor_feedback=_bool_value(
            actions.get('auto_monitor_feedback'),
            default=True,
        ),
        actions_auto_fetch_result_for_observed_goals=_bool_value(
            actions.get('auto_fetch_result_for_observed_goals'),
            default=True,
        ),
    )


def _registered_message_types(backend_root: Path) -> tuple[str, ...]:
    registry_paths = (
        _backend_config_path(
            backend_root,
            env_name='INTERFACE_REGISTRY_PATH',
            default='config/interface_registry.yaml',
        ),
        _backend_config_path(
            backend_root,
            env_name='INTERFACE_PACKAGES_REGISTRY_PATH',
            default='config/interface_packages.yaml',
        ),
    )
    message_types: list[str] = []
    for path in registry_paths:
        data = _load_monitor_yaml(path)
        registry_messages = _mapping(data.get('interface_registry')).get('messages')
        if isinstance(registry_messages, list):
            for item in registry_messages:
                entry = _mapping(item)
                build = _mapping(entry.get('build'))
                full_type = entry.get('full_type')
                if build.get('import_available') is True and isinstance(full_type, str):
                    message_types.append(full_type)

        packages = data.get('packages')
        if not isinstance(packages, list):
            continue
        for package_item in packages:
            package = _mapping(package_item)
            messages = _mapping(package.get('interfaces')).get('msg')
            if not isinstance(messages, list):
                continue
            for item in messages:
                entry = _mapping(item)
                full_type = entry.get('type')
                if entry.get('import_available') is True and isinstance(full_type, str):
                    message_types.append(full_type)

    return tuple(dict.fromkeys(message_types))


def _backend_config_path(
    backend_root: Path,
    *,
    env_name: str,
    default: str,
) -> Path:
    path = Path(os.getenv(env_name, default))
    return path if path.is_absolute() else backend_root / path


def _cors_origins() -> tuple[str, ...]:
    value = os.getenv('CORS_ORIGINS')
    if value is None:
        return tuple(DEFAULT_CORS_ORIGINS)

    origins = tuple(
        origin.strip()
        for origin in value.split(',')
        if origin.strip()
    )
    return origins or tuple(DEFAULT_CORS_ORIGINS)


def _mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value

    return {}


def _float_value(value: Any, *, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default

    if parsed <= 0:
        return default

    return parsed


def _bool_value(value: Any, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ('true', '1', 'yes', 'on'):
            return True
        if normalized in ('false', '0', 'no', 'off'):
            return False

    return default


def _string_tuple(
    value: Any,
    *,
    default: tuple[str, ...] = (),
) -> tuple[str, ...]:
    if not isinstance(value, list):
        return default

    items = tuple(item for item in value if isinstance(item, str) and item)
    return items


def _config_string_tuple(
    data: dict[str, Any],
    base_key: str,
    *,
    default: tuple[str, ...] = (),
) -> tuple[str, ...]:
    """Backend 설정 로딩에서 내부 보조 처리를 수행하는 내부 helper 함수입니다."""
    values = _string_tuple(data.get(base_key))
    if values:
        return values

    explicit_key = f'{base_key}_names'
    return _string_tuple(data.get(explicit_key), default=default)


def _service_active_check_config(value: Any) -> ServiceActiveCheckConfig:
    data = _mapping(value)
    default_timeout_sec = _float_value(
        data.get('default_timeout_sec'),
        default=2.0,
    )

    return ServiceActiveCheckConfig(
        enabled=_bool_value(data.get('enabled'), default=False),
        interval_sec=_float_value(data.get('interval_sec'), default=10.0),
        default_timeout_sec=default_timeout_sec,
        allowlist=_service_active_check_allowlist(
            data.get('allowlist'),
            default_timeout_sec=default_timeout_sec,
        ),
    )


def _service_active_check_allowlist(
    value: Any,
    *,
    default_timeout_sec: float,
) -> tuple[ServiceActiveCheckTarget, ...]:
    if not isinstance(value, list):
        return ()

    targets = []
    for item in value:
        data = _mapping(item)
        name = data.get('name')
        service_type = data.get('type')
        if not isinstance(name, str) or not name:
            continue
        if not isinstance(service_type, str) or not service_type:
            continue

        request = data.get('request')
        if request is not None and not isinstance(request, dict):
            request = None

        success_field = data.get('success_field')
        if success_field is not None and not isinstance(success_field, str):
            success_field = None

        targets.append(
            ServiceActiveCheckTarget(
                name=name,
                service_type=service_type,
                timeout_sec=_float_value(
                    data.get('timeout_sec'),
                    default=default_timeout_sec,
                ),
                request=request,
                success_field=success_field,
            ),
        )

    return tuple(targets)
