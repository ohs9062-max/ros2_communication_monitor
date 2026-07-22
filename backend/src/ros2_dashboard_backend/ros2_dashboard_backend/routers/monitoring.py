"""FastAPI Router의 monitoring 관련 기능을 담당하는 모듈입니다."""

import asyncio
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ros2_dashboard_backend.app_state import ros_monitor, websocket_manager


WEBSOCKET_INTERVAL_SEC = 1.0

router = APIRouter()


@router.get('/ros/topics')
def get_ros_topics() -> dict[str, Any]:
    """FastAPI Router에서 요청된 처리를 수행하는 함수입니다."""
    snapshot = ros_monitor.snapshot()
    return {
        'success': True,
        'data': snapshot['topics'],
        'meta': {
            'count': snapshot['count'],
            'last_updated': snapshot['last_updated'],
        },
        'message': 'ROS2 topics fetched successfully',
    }


@router.get('/ros/topics/latest')
def get_latest_ros_topic(name: str = Query(...)) -> dict[str, Any]:
    """FastAPI Router에서 요청된 처리를 수행하는 함수입니다."""
    return ros_monitor.latest_message(name)


@router.get('/ros/topics/hz')
def get_ros_topic_hz(name: str = Query(...)) -> dict[str, Any]:
    """FastAPI Router에서 요청된 처리를 수행하는 함수입니다."""
    return ros_monitor.topic_hz(name)


@router.get('/ros/services')
def get_ros_services(
    include_hidden: bool = Query(False),
) -> dict[str, Any]:
    """FastAPI Router에서 Service 실행 또는 상태를 처리하는 함수입니다."""
    snapshot = ros_monitor.service_snapshot(
        include_hidden=include_hidden,
    )
    return {
        'success': True,
        'data': {
            'services': snapshot['services'],
            'meta': snapshot['meta'],
        },
    }


@router.get('/ros/actions')
def get_ros_actions() -> dict[str, Any]:
    """FastAPI Router에서 Action 실행 또는 상태를 처리하는 함수입니다."""
    snapshot = ros_monitor.action_snapshot()
    return {
        'success': True,
        'data': {
            'actions': snapshot['actions'],
            'meta': snapshot['meta'],
        },
    }


@router.get('/ros/nodes')
def get_ros_nodes() -> dict[str, Any]:
    """FastAPI Router에서 요청된 처리를 수행하는 함수입니다."""
    snapshot = ros_monitor.node_snapshot()
    return {
        'success': True,
        'data': {
            'nodes': snapshot['nodes'],
            'meta': snapshot['meta'],
        },
    }


@router.get('/ros/alerts')
def get_ros_alerts() -> dict[str, Any]:
    """FastAPI Router에서 Alert 항목을 조립하는 함수입니다."""
    return ros_monitor.alerts()


@router.websocket('/ws/monitor')
async def monitor_websocket(websocket: WebSocket) -> None:
    """FastAPI Router에서 요청된 처리를 수행하는 함수입니다."""
    await websocket_manager.connect(websocket)
    try:
        while True:
            sent = await websocket_manager.send_json(
                websocket,
                ros_monitor.websocket_snapshot(),
            )
            if not sent:
                break

            await asyncio.sleep(WEBSOCKET_INTERVAL_SEC)
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)
    finally:
        websocket_manager.disconnect(websocket)
