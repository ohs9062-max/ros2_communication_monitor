"""FastAPI Router의 topic_execution 관련 기능을 담당하는 모듈입니다."""

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from ros2_dashboard_backend.app_state import ros_monitor
from ros2_dashboard_backend.interface_lab.execution.topic_runtime import InterfaceReceiveError


router = APIRouter()


@router.get('/ros/interfaces/callable-messages')
def get_callable_messages() -> dict[str, Any]:
    """FastAPI Router에서 현재 실행 가능한 후보를 조회하는 함수입니다."""
    snapshot = ros_monitor.callable_messages()
    return {
        'success': True,
        'data': snapshot['messages'],
        'meta': snapshot['meta'],
        'message': 'Topic 작업에 사용할 수 있는 등록 Message 목록을 조회했습니다.',
    }


@router.get('/ros/interfaces/message-schema')
def get_message_schema(full_type: str = Query(...)) -> dict[str, Any]:
    """FastAPI Router에서 interface schema를 반환하는 함수입니다."""
    try:
        snapshot = ros_monitor.message_schema(message_type=full_type)
    except InterfaceReceiveError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'data': snapshot,
        'message': 'Message schema를 조회했습니다.',
    }


@router.post('/ros/interfaces/topic-publish')
async def publish_registered_topic(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 Topic 메시지를 발행하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='JSON 요청 본문이 필요합니다.') from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='JSON object 요청 본문이 필요합니다.')

    topic_name = payload.get('topic_name')
    topic_type = payload.get('topic_type') or payload.get('full_type')
    message_data = payload.get('message')
    if not isinstance(topic_name, str) or not topic_name:
        raise HTTPException(status_code=400, detail='topic_name이 필요합니다.')
    if not isinstance(topic_type, str) or not topic_type:
        raise HTTPException(status_code=400, detail='topic_type 또는 full_type이 필요합니다.')
    if not isinstance(message_data, dict):
        raise HTTPException(status_code=400, detail='message object가 필요합니다.')

    try:
        result = ros_monitor.publish_topic(
            topic_name=topic_name,
            topic_type=topic_type,
            payload=message_data,
        )
    except InterfaceReceiveError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        **result,
        'message': (
            '입력값이 Message 타입과 맞지 않아 Publish하지 않았습니다.'
            if result.get('error_type') == 'validation_error'
            else (
                'Action 내부 Topic은 일반 Message Publish에서 사용할 수 없습니다.'
                if result.get('error_type') == 'action_internal_topic'
                else (
                    '같은 Topic 이름에 다른 Message type이 있어 Publish하지 않았습니다.'
                    if result.get('error_type') == 'topic_type_conflict'
                    else 'Topic Publish가 완료되었습니다.'
                )
            )
        ),
    }


@router.get('/ros/interfaces/topic-publish/history')
def get_topic_publish_history(limit: int | None = Query(default=100)) -> dict[str, Any]:
    """FastAPI Router에서 실행 이력을 반환하거나 관리하는 함수입니다."""
    snapshot = ros_monitor.topic_publish_history(limit=limit)
    return {'success': True, 'data': snapshot['history'], 'meta': snapshot['meta']}


@router.post('/ros/interfaces/topic-publish/history/reset')
async def reset_topic_publish_history(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 실행 이력을 반환하거나 관리하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError:
        payload = {}
    snapshot = ros_monitor.reset_topic_publish_history(
        topic_name=payload.get('topic_name'),
        topic_type=payload.get('topic_type') or payload.get('full_type'),
    )
    return {'success': True, 'data': snapshot, 'message': 'Topic Publish 이력을 초기화했습니다.'}


@router.post('/ros/interfaces/receive/topics/start')
async def start_receive_topic(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 수신 상태와 이력을 관리하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='JSON 요청 본문이 필요합니다.') from exc
    try:
        state = ros_monitor.start_receive_topic(
            topic_name=str(payload.get('topic_name') or ''),
            topic_type=str(payload.get('topic_type') or payload.get('full_type') or ''),
            history_limit=int(payload.get('history_limit') or 100),
        )
    except (InterfaceReceiveError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {'success': True, 'data': state, 'message': 'Topic 수신을 시작했습니다.'}


@router.post('/ros/interfaces/receive/topics/stop')
async def stop_receive_topic(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 수신 상태와 이력을 관리하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='JSON 요청 본문이 필요합니다.') from exc
    state = ros_monitor.stop_receive_topic(
        topic_name=str(payload.get('topic_name') or ''),
        topic_type=payload.get('topic_type') or payload.get('full_type'),
    )
    return {'success': True, 'data': state, 'message': 'Topic 수신을 중지했습니다.'}


@router.get('/ros/interfaces/receive/topics')
def get_receive_topics() -> dict[str, Any]:
    """FastAPI Router에서 수신 상태와 이력을 관리하는 함수입니다."""
    snapshot = ros_monitor.receive_topics()
    return {'success': True, 'data': snapshot['topics'], 'meta': snapshot['meta']}


@router.get('/ros/interfaces/receive/topics/history')
def get_receive_topic_history(
    topic_name: str | None = Query(default=None),
    topic_type: str | None = Query(default=None),
    full_type: str | None = Query(default=None),
    limit: int | None = Query(default=500),
) -> dict[str, Any]:
    """FastAPI Router에서 실행 이력을 반환하거나 관리하는 함수입니다."""
    snapshot = ros_monitor.receive_topic_history(
        topic_name=topic_name,
        topic_type=topic_type or full_type,
        limit=limit,
    )
    return {'success': True, 'data': snapshot['history'], 'meta': snapshot['meta']}


@router.post('/ros/interfaces/receive/topics/history/reset')
async def reset_receive_topic_history(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 실행 이력을 반환하거나 관리하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError:
        payload = {}
    topic_name = payload.get('topic_name')
    topic_type = payload.get('topic_type') or payload.get('full_type')
    snapshot = ros_monitor.reset_receive_topic_history(
        topic_name=str(topic_name) if topic_name else None,
        topic_type=str(topic_type) if topic_type else None,
    )
    return {'success': True, 'data': snapshot, 'message': 'Topic 수신 이력을 초기화했습니다.'}
