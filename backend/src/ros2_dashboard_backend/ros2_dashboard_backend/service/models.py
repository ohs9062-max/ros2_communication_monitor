"""Service 모니터링의 models 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations


SERVICE_STATUS_ACTIVE = 'active'
SERVICE_STATUS_WAITING_SERVER = 'waiting_server'
SERVICE_STATUS_INACTIVE = 'inactive'
SERVICE_STATUS_UNKNOWN = 'unknown'

SERVICE_CATEGORY_USER = 'user'
SERVICE_CATEGORY_PARAMETER = 'parameter'
SERVICE_CATEGORY_ACTION_INTERNAL = 'action_internal'
SERVICE_CATEGORY_ROS_INTERNAL = 'ros_internal'
SERVICE_CATEGORY_UNKNOWN = 'unknown'

ACTIVE_CHECK_STATUS_SUCCESS = 'success'
ACTIVE_CHECK_STATUS_FAILED = 'failed'
ACTIVE_CHECK_STATUS_TIMEOUT = 'timeout'
ACTIVE_CHECK_STATUS_ERROR = 'error'
ACTIVE_CHECK_STATUS_PENDING = 'pending'

ALERT_LEVEL_WARNING = 'warning'
ALERT_CODE_SERVICE_WAITING_SERVER = 'service_waiting_server'


def is_valid_service_type(service_type: str | None) -> bool:
    """Service 모니터링에서 Service 실행 또는 상태를 처리하는 함수입니다."""
    if not service_type:
        return False

    parts = service_type.split('/')
    return len(parts) == 3 and parts[1] == 'srv' and all(parts)


def service_status(
    service_type: str | None,
    server_count: int,
    client_count: int | None,
) -> tuple[str, str]:
    """Service 모니터링에서 Service 실행 또는 상태를 처리하는 함수입니다."""
    if not is_valid_service_type(service_type):
        return SERVICE_STATUS_UNKNOWN, 'service type is unknown'

    if server_count > 0:
        return SERVICE_STATUS_ACTIVE, 'service server available'

    if client_count is None:
        client_count = 0

    if server_count == 0 and client_count > 0:
        return (
            SERVICE_STATUS_WAITING_SERVER,
            'service client exists but no server',
        )

    return SERVICE_STATUS_INACTIVE, 'no service server and no client'


def service_hidden_by_default(category: str) -> bool:
    """Service 모니터링에서 Service 실행 또는 상태를 처리하는 함수입니다."""
    return category != SERVICE_CATEGORY_USER


def service_meta(
    *,
    services: list[dict],
    all_services: list[dict] | None = None,
    last_updated: float,
) -> dict[str, int | float]:
    """Service 모니터링에서 Service 실행 또는 상태를 처리하는 함수입니다."""
    counted_services = all_services if all_services is not None else services

    return {
        'count': len(services),
        'visible_count': len(services),
        'hidden_count': sum(
            1 for service in counted_services
            if service.get('hidden_by_default') is True
        ),
        'user_count': _category_count(
            counted_services,
            SERVICE_CATEGORY_USER,
        ),
        'parameter_count': _category_count(
            counted_services,
            SERVICE_CATEGORY_PARAMETER,
        ),
        'action_internal_count': _category_count(
            counted_services,
            SERVICE_CATEGORY_ACTION_INTERNAL,
        ),
        'ros_internal_count': _category_count(
            counted_services,
            SERVICE_CATEGORY_ROS_INTERNAL,
        ),
        'unknown_count': _category_count(
            counted_services,
            SERVICE_CATEGORY_UNKNOWN,
        ),
        'active_count': sum(
            1 for service in services
            if service.get('status') == SERVICE_STATUS_ACTIVE
        ),
        'warning_count': sum(
            1 for service in services
            if service.get('status') == SERVICE_STATUS_WAITING_SERVER
        ),
        'error_count': sum(
            1 for service in services
            if (
                service.get('status') == SERVICE_STATUS_UNKNOWN
                and service.get('hidden_by_default') is not True
            )
        ),
        'active_check_supported_count': _active_check_supported_count(
            services,
        ),
        'active_check_success_count': _active_check_status_count(
            services,
            ACTIVE_CHECK_STATUS_SUCCESS,
        ),
        'active_check_failed_count': _active_check_status_count(
            services,
            ACTIVE_CHECK_STATUS_FAILED,
        ),
        'active_check_timeout_count': _active_check_status_count(
            services,
            ACTIVE_CHECK_STATUS_TIMEOUT,
        ),
        'active_check_error_count': _active_check_status_count(
            services,
            ACTIVE_CHECK_STATUS_ERROR,
        ),
        'active_check_pending_count': _active_check_status_count(
            services,
            ACTIVE_CHECK_STATUS_PENDING,
        ),
        'active_check_unsupported_count': sum(
            1 for service in services
            if service.get('active_check_supported') is not True
        ),
        'last_updated': last_updated,
    }


def _category_count(services: list[dict], category: str) -> int:
    return sum(
        1 for service in services
        if service.get('category') == category
    )


def _active_check_supported_count(services: list[dict]) -> int:
    return sum(
        1 for service in services
        if service.get('active_check_supported') is True
    )


def _active_check_status_count(
    services: list[dict],
    status: str,
) -> int:
    return sum(
        1 for service in services
        if service.get('active_check', {}).get('last_status') == status
    )
