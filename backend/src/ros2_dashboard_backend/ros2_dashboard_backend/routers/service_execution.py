"""FastAPI Router의 service_execution 관련 기능을 담당하는 모듈입니다."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request

from ros2_dashboard_backend.app_state import ros_monitor
from ros2_dashboard_backend.interface_lab.execution.service_call_runtime import ServiceCallError


router = APIRouter()


@router.get('/ros/interfaces/callable-services')
def get_callable_services() -> dict[str, Any]:
    """FastAPI Router에서 현재 실행 가능한 후보를 조회하는 함수입니다."""
    snapshot = ros_monitor.callable_services()
    return {
        'success': True,
        'data': snapshot['services'],
        'meta': snapshot['meta'],
        'message': '호출 가능한 등록 Service 목록을 조회했습니다.',
    }


@router.post('/ros/interfaces/service-call')
async def call_registered_service(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 Service 실행 또는 상태를 처리하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='JSON 요청 본문이 필요합니다.') from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='JSON object 요청 본문이 필요합니다.')

    service_name = payload.get('service_name')
    service_type = payload.get('service_type')
    request_data = payload.get('request')
    if not isinstance(service_name, str) or not service_name:
        raise HTTPException(status_code=400, detail='service_name이 필요합니다.')
    if not isinstance(service_type, str) or not service_type:
        raise HTTPException(status_code=400, detail='service_type이 필요합니다.')
    if not isinstance(request_data, dict):
        raise HTTPException(status_code=400, detail='request object가 필요합니다.')

    try:
        result = ros_monitor.call_service(
            service_name=service_name,
            service_type=service_type,
            request_data=request_data,
            timeout_sec=payload.get('timeout_sec'),
        )
    except ServiceCallError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        **result,
        'message': (
            '입력값이 서비스 타입과 맞지 않아 호출하지 않았습니다. 서버에는 요청을 보내지 않았습니다.'
            if result.get('error_type') == 'validation_error'
            else 'Service call이 완료되었습니다.'
        ),
    }


@router.get('/ros/interfaces/service-call/history')
def get_service_call_history() -> dict[str, Any]:
    """FastAPI Router에서 실행 이력을 반환하거나 관리하는 함수입니다."""
    snapshot = ros_monitor.service_call_history()
    return {
        'success': True,
        'data': snapshot['calls'],
        'meta': snapshot['meta'],
        'message': 'Service call history를 조회했습니다.',
    }


@router.get('/ros/interfaces/receive/services/history')
def get_receive_service_history() -> dict[str, Any]:
    """FastAPI Router에서 실행 이력을 반환하거나 관리하는 함수입니다."""
    snapshot = ros_monitor.receive_service_history()
    return {'success': True, 'data': snapshot['history'], 'meta': snapshot['meta']}


@router.post('/ros/interfaces/receive/services/history/reset')
async def reset_receive_service_history(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 실행 이력을 반환하거나 관리하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError:
        payload = {}
    snapshot = ros_monitor.reset_receive_service_history(
        service_name=payload.get('service_name'),
        service_type=payload.get('service_type'),
    )
    return {'success': True, 'data': snapshot, 'message': 'Service 수신 이력을 초기화했습니다.'}
