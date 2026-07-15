"""FastAPI entry point for the ROS 2 dashboard backend."""

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from ros2_dashboard_backend.config_loader import load_backend_config
from ros2_dashboard_backend.interface_registry import (
    InterfaceUploadError,
    MAX_INTERFACE_FILE_SIZE,
    extract_multipart_file,
    register_interface,
    registry_snapshot,
)
from ros2_dashboard_backend.ros_monitor import RosMonitor
from ros2_dashboard_backend.websocket_manager import WebSocketManager


WEBSOCKET_INTERVAL_SEC = 1.0
backend_config = load_backend_config()
ros_monitor = RosMonitor(backend_config.monitor)
websocket_manager = WebSocketManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start and stop the ROS 2 monitor coordinator with the API process."""
    ros_monitor.start()
    try:
        yield
    finally:
        ros_monitor.stop()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(backend_config.cors_origins),
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/health')
def health() -> dict[str, Any]:
    """Return backend health status."""
    return {
        'success': True,
        'data': {
            'status': 'running',
        },
        'message': 'Backend is running',
    }


@app.get('/ros/topics')
def get_ros_topics() -> dict[str, Any]:
    """Return the cached ROS 2 topic snapshot."""
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


@app.get('/ros/topics/latest')
def get_latest_ros_topic(name: str = Query(...)) -> dict[str, Any]:
    """Return the latest cached message preview for a ROS 2 topic."""
    return ros_monitor.latest_message(name)


@app.get('/ros/topics/hz')
def get_ros_topic_hz(name: str = Query(...)) -> dict[str, Any]:
    """Return the recent message frequency for a ROS 2 topic."""
    return ros_monitor.topic_hz(name)


@app.get('/ros/services')
def get_ros_services(
    include_hidden: bool = Query(False),
) -> dict[str, Any]:
    """Return the cached ROS 2 service snapshot."""
    snapshot = ros_monitor.service_snapshot(
        include_hidden=include_hidden,
    )
    return {
        'ok': True,
        'data': {
            'services': snapshot['services'],
            'meta': snapshot['meta'],
        },
    }


@app.get('/ros/actions')
def get_ros_actions() -> dict[str, Any]:
    """Return the cached ROS 2 action snapshot."""
    snapshot = ros_monitor.action_snapshot()
    return {
        'ok': True,
        'data': {
            'actions': snapshot['actions'],
            'meta': snapshot['meta'],
        },
    }


@app.get('/ros/nodes')
def get_ros_nodes() -> dict[str, Any]:
    """Return the cached ROS 2 node snapshot."""
    snapshot = ros_monitor.node_snapshot()
    return {
        'ok': True,
        'data': {
            'nodes': snapshot['nodes'],
            'meta': snapshot['meta'],
        },
    }


@app.get('/ros/alerts')
def get_ros_alerts() -> dict[str, Any]:
    """Return current ROS 2 monitoring alerts."""
    return ros_monitor.alerts()


@app.post('/ros/interfaces/upload')
async def upload_ros_interface(request: Request) -> dict[str, Any]:
    """Register one uploaded ROS interface definition without executing it."""
    content_length = request.headers.get('content-length')
    if content_length:
        try:
            request_size = int(content_length)
        except ValueError:
            request_size = 0
        if request_size > MAX_INTERFACE_FILE_SIZE + 64 * 1024:
            raise HTTPException(status_code=413, detail='업로드 요청이 너무 큽니다.')

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_INTERFACE_FILE_SIZE + 64 * 1024:
            raise HTTPException(status_code=413, detail='업로드 요청이 너무 큽니다.')
    try:
        file_name, content = extract_multipart_file(
            request.headers.get('content-type', ''), bytes(body),
        )
        entry = register_interface(file_name, content)
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'data': entry,
        'message': '인터페이스 타입이 등록되었습니다.',
    }


@app.get('/ros/interfaces/registry')
def get_interface_registry() -> dict[str, Any]:
    """Return uploaded interface definitions."""
    try:
        registry = registry_snapshot()
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        'success': True,
        'data': registry['interface_registry'],
        'message': '등록된 인터페이스 타입을 조회했습니다.',
    }


@app.websocket('/ws/monitor')
async def monitor_websocket(websocket: WebSocket) -> None:
    """Stream lightweight ROS 2 monitor snapshots to one WebSocket client."""
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
