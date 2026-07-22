"""FastAPI Router의 interface_apply 관련 기능을 담당하는 모듈입니다."""

from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException

from ros2_dashboard_backend.interface_lab.apply.runtime import (
    InterfaceApplyError,
    InterfaceApplyInProgress,
    apply_status,
    record_import_check_status,
    run_interface_apply,
    run_import_check_and_update_registry,
    touch_reload_trigger_after_delay,
)
from ros2_dashboard_backend.interface_lab.management.registry import (
    InterfaceUploadError,
    refresh_registry_imports,
)


router = APIRouter()


@router.post('/ros/interfaces/apply')
def apply_ros_interfaces(background_tasks: BackgroundTasks) -> dict[str, Any]:
    """FastAPI Router에서 interface build/apply 상태를 처리하는 함수입니다."""
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


@router.get('/ros/interfaces/apply/status')
def get_interface_apply_status() -> dict[str, Any]:
    """FastAPI Router에서 interface build/apply 상태를 처리하는 함수입니다."""
    try:
        status = apply_status()
    except InterfaceApplyError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        'success': True,
        'data': status,
        'message': '인터페이스 적용 상태를 조회했습니다.',
    }


@router.post('/ros/interfaces/import-check')
def check_ros_interface_imports() -> dict[str, Any]:
    """FastAPI Router에서 생성된 interface 타입 import 가능 여부를 확인하는 함수입니다."""
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
