"""FastAPI entry point for the ROS 2 dashboard backend."""

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from ros2_dashboard_backend.config_loader import load_backend_config
from ros2_dashboard_backend.ros_monitor import TopicMonitor
from ros2_dashboard_backend.websocket_manager import WebSocketManager


WEBSOCKET_INTERVAL_SEC = 1.0
backend_config = load_backend_config()
topic_monitor = TopicMonitor(backend_config.monitor)
websocket_manager = WebSocketManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start and stop the ROS 2 topic monitor with the API process."""
    topic_monitor.start()
    try:
        yield
    finally:
        topic_monitor.stop()


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
    snapshot = topic_monitor.snapshot()
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
    return topic_monitor.latest_message(name)


@app.get('/ros/topics/hz')
def get_ros_topic_hz(name: str = Query(...)) -> dict[str, Any]:
    """Return the recent message frequency for a ROS 2 topic."""
    return topic_monitor.topic_hz(name)


@app.get('/ros/services')
def get_ros_services(
    include_hidden: bool = Query(False),
) -> dict[str, Any]:
    """Return the cached ROS 2 service snapshot."""
    snapshot = topic_monitor.service_snapshot(
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
    snapshot = topic_monitor.action_snapshot()
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
    snapshot = topic_monitor.node_snapshot()
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
    return topic_monitor.alerts()


@app.websocket('/ws/monitor')
async def monitor_websocket(websocket: WebSocket) -> None:
    """Stream lightweight ROS 2 monitor snapshots to one WebSocket client."""
    await websocket_manager.connect(websocket)
    try:
        while True:
            sent = await websocket_manager.send_json(
                websocket,
                topic_monitor.websocket_snapshot(),
            )
            if not sent:
                break

            await asyncio.sleep(WEBSOCKET_INTERVAL_SEC)
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)
    finally:
        websocket_manager.disconnect(websocket)
