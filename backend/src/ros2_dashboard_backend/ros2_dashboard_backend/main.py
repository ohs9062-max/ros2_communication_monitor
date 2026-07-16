"""FastAPI entry point for the ROS 2 dashboard backend."""

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import (
    BackgroundTasks,
    FastAPI,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware

from ros2_dashboard_backend.config_loader import load_backend_config
from ros2_dashboard_backend.action.goal_runtime import ActionGoalError
from ros2_dashboard_backend.interface_apply import (
    InterfaceApplyError,
    InterfaceApplyInProgress,
    apply_status,
    record_import_check_status,
    run_interface_apply,
    run_import_check_and_update_registry,
    touch_reload_trigger_after_delay,
)
from ros2_dashboard_backend.interface_registry import (
    InterfaceUploadError,
    MAX_INTERFACE_FILE_SIZE,
    default_registry_path,
    extract_multipart_file,
    refresh_registry_imports,
    register_interface,
    registry_snapshot,
)
from ros2_dashboard_backend.interface_packages import (
    InterfacePackageError,
    MAX_PACKAGE_ZIP_SIZE,
    delete_interface_package,
    extract_multipart_package_files,
    packages_snapshot,
    upload_interface_package,
    upload_interface_package_folder,
)
from ros2_dashboard_backend.ros_monitor import RosMonitor
from ros2_dashboard_backend.service.call_runtime import ServiceCallError
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
        if not default_registry_path().is_file():
            raise InterfaceUploadError(
                f'interface_registry.yaml 파일이 생성되지 않았습니다: {default_registry_path()}',
            )
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    build = entry.get('build', {})
    file_ready = (
        build.get('file_saved')
        and build.get('cmake_registered')
        and build.get('package_xml_checked')
    )
    return {
        'success': bool(file_ready),
        'status': 'uploaded' if file_ready else 'partial',
        'data': entry,
        'registry_path': entry.get('registry_path'),
        'saved_path': build.get('saved_path'),
        'message': (
            'YAML 저장, interface 파일 생성, CMake 등록, package.xml 확인이 완료되었습니다.'
            if file_ready
            else '부분 적용: 파일 생성 또는 CMake 등록이 완료되지 않았습니다. 상세 상태를 확인하세요.'
        ),
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


@app.post('/ros/interfaces/packages/upload')
async def upload_ros_interface_package(
    request: Request,
    replace: bool = Query(False),
) -> dict[str, Any]:
    """Upload one zipped ROS 2 interface package while preserving its package name."""
    content_length = request.headers.get('content-length')
    if content_length:
        try:
            request_size = int(content_length)
        except ValueError:
            request_size = 0
        if request_size > MAX_PACKAGE_ZIP_SIZE + 64 * 1024:
            raise HTTPException(status_code=413, detail='패키지 업로드 요청이 너무 큽니다.')

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_PACKAGE_ZIP_SIZE + 64 * 1024:
            raise HTTPException(status_code=413, detail='패키지 업로드 요청이 너무 큽니다.')
    try:
        file_name, content = extract_multipart_file(
            request.headers.get('content-type', ''), bytes(body),
        )
        entry = upload_interface_package(file_name, content, replace=replace)
    except InterfacePackageError as exc:
        status_code = 409 if '이미 있습니다' in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'status': 'uploaded',
        'data': entry,
        'message': 'interface package 업로드가 완료되었습니다. 적용하기로 build/import를 진행하세요.',
    }


@app.post('/ros/interfaces/packages/folder-upload')
async def upload_ros_interface_package_folder(
    request: Request,
    replace: bool = Query(False),
) -> dict[str, Any]:
    """Upload one ROS 2 interface package folder using browser relative paths."""
    content_length = request.headers.get('content-length')
    if content_length:
        try:
            request_size = int(content_length)
        except ValueError:
            request_size = 0
        if request_size > MAX_PACKAGE_ZIP_SIZE + 512 * 1024:
            raise HTTPException(status_code=413, detail='패키지 폴더 업로드 요청이 너무 큽니다.')

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_PACKAGE_ZIP_SIZE + 512 * 1024:
            raise HTTPException(status_code=413, detail='패키지 폴더 업로드 요청이 너무 큽니다.')
    try:
        files = extract_multipart_package_files(
            request.headers.get('content-type', ''), bytes(body),
        )
        entry = upload_interface_package_folder(files, replace=replace)
    except InterfacePackageError as exc:
        status_code = 409 if '이미 있습니다' in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    return {
        'success': True,
        'status': 'uploaded',
        'data': entry,
        'message': 'interface package 폴더 업로드가 완료되었습니다. 적용하기로 build/import를 진행하세요.',
    }


@app.get('/ros/interfaces/packages')
def get_interface_packages() -> dict[str, Any]:
    """Return uploaded interface package registry."""
    try:
        registry = packages_snapshot()
    except InterfacePackageError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        'success': True,
        'data': registry['packages'],
        'meta': {
            'count': len(registry['packages']),
        },
        'message': '업로드된 interface package 목록을 조회했습니다.',
    }


@app.delete('/ros/interfaces/packages/{package_name}')
def delete_ros_interface_package(package_name: str) -> dict[str, Any]:
    """Delete one uploaded interface package."""
    try:
        result = delete_interface_package(package_name)
    except InterfacePackageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'data': result,
        'message': 'interface package를 삭제했습니다. 적용하기로 build 상태를 갱신하세요.',
    }


@app.post('/ros/interfaces/apply')
def apply_ros_interfaces(background_tasks: BackgroundTasks) -> dict[str, Any]:
    """Build registered ROS interfaces and schedule uvicorn reload on success."""
    try:
        status = run_interface_apply()
    except InterfaceApplyInProgress as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except InterfaceApplyError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if status.get('real_apply_success'):
        background_tasks.add_task(touch_reload_trigger_after_delay)
        return {
            'success': True,
            'status': status['status'],
            'data': status,
            'build_status': status['build_status'],
            'real_apply_success': True,
            'reload_scheduled': status['reload_scheduled'],
            'summary': status.get('summary'),
            'not_applied': status.get('not_applied', []),
            'message': '적용 완료. 새 interface 타입을 사용할 수 있습니다.',
        }

    message = (
        '일부 interface가 파일 생성 또는 CMake 등록되지 않았습니다.'
        if status.get('status') == 'partial'
        else (
            '빌드는 성공했지만 현재 backend 프로세스에서 import 확인에 실패했습니다.'
            if status.get('status') == 'import_failed'
            else '빌드 실패. CMakeLists.txt, package.xml, interface 의존성을 확인하세요.'
        )
    )
    return {
        'success': False,
        'status': status.get('status', 'failed'),
        'data': status,
        'build_status': status['build_status'],
        'real_apply_success': False,
        'reload_scheduled': False,
        'summary': status.get('summary'),
        'not_applied': status.get('not_applied', []),
        'message': message,
    }


@app.get('/ros/interfaces/apply/status')
def get_interface_apply_status() -> dict[str, Any]:
    """Return the latest interface apply build status."""
    try:
        status = apply_status()
    except InterfaceApplyError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        'success': True,
        'data': status,
        'message': '인터페이스 적용 상태를 조회했습니다.',
    }


@app.post('/ros/interfaces/import-check')
def check_ros_interface_imports() -> dict[str, Any]:
    """Refresh generated interface import availability in the registry."""
    try:
        result = run_import_check_and_update_registry()
        record_import_check_status(result)
        registry = refresh_registry_imports()
        summary = result['summary']
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        'success': bool(summary['real_apply_success']),
        'status': summary['status'],
        'real_apply_success': bool(summary['real_apply_success']),
        'data': registry['interface_registry'],
        'summary': summary,
        'not_applied': summary['not_applied'],
        'install_python_paths': result['install_python_paths'],
        'install_python_paths_added': result['install_python_paths_added'],
        'message': '인터페이스 import 상태를 재확인했습니다.',
    }


@app.get('/ros/interfaces/callable-services')
def get_callable_services() -> dict[str, Any]:
    """Return registered, importable service types with active servers."""
    snapshot = ros_monitor.callable_services()
    return {
        'success': True,
        'data': snapshot['services'],
        'meta': snapshot['meta'],
        'message': '호출 가능한 등록 Service 목록을 조회했습니다.',
    }


@app.post('/ros/interfaces/service-call')
async def call_registered_service(request: Request) -> dict[str, Any]:
    """Call one registered and importable ROS 2 service explicitly."""
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


@app.get('/ros/interfaces/service-call/history')
def get_service_call_history() -> dict[str, Any]:
    """Return recent explicit service call history."""
    snapshot = ros_monitor.service_call_history()
    return {
        'success': True,
        'data': snapshot['calls'],
        'meta': snapshot['meta'],
        'message': 'Service call history를 조회했습니다.',
    }


@app.get('/ros/interfaces/callable-actions')
def get_callable_actions() -> dict[str, Any]:
    """Return registered, importable action types with action server state."""
    snapshot = ros_monitor.callable_actions()
    return {
        'success': True,
        'data': snapshot['actions'],
        'meta': snapshot['meta'],
        'message': '실행 가능한 등록 Action 목록을 조회했습니다.',
    }


@app.post('/ros/interfaces/action-goal')
async def send_registered_action_goal(request: Request) -> dict[str, Any]:
    """Send one registered and importable ROS 2 action goal explicitly."""
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='JSON 요청 본문이 필요합니다.') from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='JSON object 요청 본문이 필요합니다.')

    action_name = payload.get('action_name')
    action_type = payload.get('action_type')
    goal_data = payload.get('goal')
    if not isinstance(action_name, str) or not action_name:
        raise HTTPException(status_code=400, detail='action_name이 필요합니다.')
    if not isinstance(action_type, str) or not action_type:
        raise HTTPException(status_code=400, detail='action_type이 필요합니다.')
    if not isinstance(goal_data, dict):
        raise HTTPException(status_code=400, detail='goal object가 필요합니다.')

    try:
        result = ros_monitor.send_action_goal(
            action_name=action_name,
            action_type=action_type,
            goal_data=goal_data,
            timeout_sec=payload.get('timeout_sec'),
        )
    except ActionGoalError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        **result,
        'message': (
            '입력값이 Action 타입과 맞지 않아 Goal을 보내지 않았습니다. 서버에는 요청을 보내지 않았습니다.'
            if result.get('error_type') == 'validation_error'
            else 'Action Goal 실행이 완료되었습니다.'
        ),
    }


@app.get('/ros/interfaces/action-goal/history')
def get_action_goal_history() -> dict[str, Any]:
    """Return recent explicit action goal history."""
    snapshot = ros_monitor.action_goal_history()
    return {
        'success': True,
        'data': snapshot['goals'],
        'meta': snapshot['meta'],
        'message': 'Action Goal history를 조회했습니다.',
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
