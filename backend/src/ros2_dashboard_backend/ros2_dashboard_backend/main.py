"""ROS2 Dashboard Backend의 main 관련 기능을 담당하는 모듈입니다."""

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ros2_dashboard_backend.app_state import backend_config, ros_monitor
from ros2_dashboard_backend.routers import (
    action_execution,
    interface_apply,
    interface_management,
    monitoring,
    service_execution,
    topic_execution,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """ROS2 Dashboard Backend에서 요청된 처리를 수행하는 함수입니다."""
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

app.include_router(monitoring.router)
app.include_router(interface_management.router)
app.include_router(interface_apply.router)
app.include_router(topic_execution.router)
app.include_router(service_execution.router)
app.include_router(action_execution.router)


@app.get('/health')
def health() -> dict[str, Any]:
    """ROS2 Dashboard Backend에서 요청된 처리를 수행하는 함수입니다."""
    return {
        'success': True,
        'data': {
            'status': 'running',
        },
        'message': 'Backend is running',
    }
