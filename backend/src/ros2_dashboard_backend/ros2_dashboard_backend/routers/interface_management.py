"""FastAPI Router의 interface_management 관련 기능을 담당하는 모듈입니다."""

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from ros2_dashboard_backend.interface_lab.apply.runtime import mark_interface_change_pending
from ros2_dashboard_backend.interface_lab.management.packages import (
    InterfacePackageError,
    MAX_PACKAGE_ZIP_SIZE,
    delete_interface_package,
    extract_multipart_package_files,
    packages_snapshot,
    upload_interface_package,
    upload_interface_package_folder,
)
from ros2_dashboard_backend.interface_lab.management.registry import (
    InterfaceUploadError,
    MAX_INTERFACE_FILE_SIZE,
    default_registry_path,
    delete_registry_entry,
    extract_multipart_file,
    register_interface,
    registry_snapshot,
)
from ros2_dashboard_backend.interface_lab.management.manual_interfaces import (
    delete_manual_definition,
    delete_uploaded_interface,
    rebuild_uploaded_interfaces_cmake,
    register_manual_type,
    update_manual_definition,
    validate_manual_definition,
    write_manual_definition,
)


router = APIRouter()


@router.post('/ros/interfaces/upload')
async def upload_ros_interface(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 필요한 ROS2 타입이나 설정을 불러오는 함수입니다."""
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


@router.get('/ros/interfaces/registry')
def get_interface_registry() -> dict[str, Any]:
    """FastAPI Router에서 요청된 처리를 수행하는 함수입니다."""
    try:
        registry = registry_snapshot()
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        'success': True,
        'data': registry['interface_registry'],
        'message': '등록된 인터페이스 타입을 조회했습니다.',
    }


@router.delete('/ros/interfaces/registry/{kind}/{file_name}')
def delete_interface_registry_entry(
    kind: str,
    file_name: str,
    source: str | None = Query(default=None),
    full_type: str | None = Query(default=None),
) -> dict[str, Any]:
    """FastAPI Router에서 등록 항목이나 파일을 삭제하는 함수입니다."""
    try:
        collection_name = {'msg': 'messages', 'srv': 'services', 'action': 'actions'}.get(kind)
        items = registry_snapshot()['interface_registry'].get(collection_name, [])
        selected = next((
            item for item in items
            if item.get('file_name') == file_name
            and (source is None or item.get('source') == source)
            and (full_type is None or item.get('full_type') == full_type)
        ), None)
        package_name = str(
            (selected or {}).get('build', {}).get('interface_package')
            or str((selected or {}).get('full_type', '')).split('/', 1)[0]
        )
        if package_name == 'uploaded_interfaces':
            result = delete_uploaded_interface(
                kind=kind, file_name=file_name, source=source, full_type=full_type,
            )
            mark_interface_change_pending(
                f'{result.get("full_type") or file_name} 삭제됨; rebuild 필요',
            )
        else:
            result = delete_registry_entry(
                kind=kind,
                file_name=file_name,
                source=source,
                full_type=full_type,
            )
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'data': result,
        'message': result['message'],
    }


@router.post('/ros/interfaces/manual-type')
async def register_manual_interface_type(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 interface 등록 정보를 저장하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='JSON 요청 본문이 필요합니다.') from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='JSON object 요청 본문이 필요합니다.')
    try:
        entry = register_manual_type(
            full_type=str(payload.get('full_type') or ''),
            allowlisted=payload.get('allowlisted', True) is not False,
            description=str(payload.get('description') or ''),
        )
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'entry': entry,
        'data': entry,
        'message': '타입 직접 등록이 완료되었습니다. 파일/CMake/package.xml은 수정하지 않았습니다.',
    }


@router.post('/ros/interfaces/manual-definition')
async def write_manual_interface_definition(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 요청된 처리를 수행하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='JSON 요청 본문이 필요합니다.') from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='JSON object 요청 본문이 필요합니다.')
    try:
        entry = write_manual_definition(
            package=str(payload.get('package') or 'uploaded_interfaces'),
            kind=str(payload.get('kind') or ''),
            type_name=str(payload.get('type_name') or ''),
            definition=str(payload.get('definition') or ''),
        )
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'entry': entry,
        'data': entry,
        'message': '인터페이스 직접 작성이 저장되었습니다. 적용하기로 build/import를 진행하세요.',
    }


@router.post('/ros/interfaces/manual-definition/validate')
async def validate_manual_interface_definition(request: Request) -> dict[str, Any]:
    """FastAPI Router에서 입력값을 검증하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='JSON 요청 본문이 필요합니다.') from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='JSON object 요청 본문이 필요합니다.')
    try:
        result = validate_manual_definition(
            package=str(payload.get('package') or 'uploaded_interfaces'),
            kind=str(payload.get('kind') or ''),
            type_name=str(payload.get('type_name') or ''),
            definition=str(payload.get('definition') or ''),
        )
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'data': result,
        'message': '문법 검증을 통과했습니다. 아직 파일/CMake/registry는 수정하지 않았습니다.',
    }


@router.put('/ros/interfaces/manual-definition/{kind}/{type_name}')
async def update_manual_interface_definition(kind: str, type_name: str, request: Request) -> dict[str, Any]:
    """FastAPI Router에서 runtime 상태를 갱신하는 함수입니다."""
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='JSON 요청 본문이 필요합니다.') from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='JSON object 요청 본문이 필요합니다.')
    try:
        entry = update_manual_definition(
            kind=kind,
            type_name=type_name,
            definition=str(payload.get('definition') or ''),
        )
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'entry': entry,
        'data': entry,
        'message': '인터페이스 직접 작성 항목을 수정했습니다. 적용하기로 build/import를 다시 진행하세요.',
    }


@router.delete('/ros/interfaces/manual-definition/{kind}/{type_name}')
def delete_manual_interface_definition(kind: str, type_name: str) -> dict[str, Any]:
    """FastAPI Router에서 등록 항목이나 파일을 삭제하는 함수입니다."""
    try:
        result = delete_manual_definition(kind=kind, type_name=type_name)
        mark_interface_change_pending(
            f'{result.get("full_type") or type_name} 삭제됨; rebuild 필요',
        )
    except InterfaceUploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'data': result,
        'message': '인터페이스 직접 작성 항목을 삭제하고 CMakeLists.txt를 재생성했습니다.',
    }


@router.post('/ros/interfaces/uploaded-interfaces/rebuild-cmake')
def rebuild_uploaded_interfaces_cmake_endpoint() -> dict[str, Any]:
    """FastAPI Router에서 public API 응답 항목을 조립하는 함수입니다."""
    result = rebuild_uploaded_interfaces_cmake()
    mark_interface_change_pending('uploaded_interfaces package metadata 재생성됨; rebuild 필요')
    return {
        'success': True,
        'data': result,
        'message': 'uploaded_interfaces/CMakeLists.txt를 실제 파일 목록 기준으로 재생성했습니다.',
    }


@router.post('/ros/interfaces/packages/upload')
async def upload_ros_interface_package(
    request: Request,
    replace: bool = Query(False),
) -> dict[str, Any]:
    """FastAPI Router에서 필요한 ROS2 타입이나 설정을 불러오는 함수입니다."""
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


@router.post('/ros/interfaces/packages/folder-upload')
async def upload_ros_interface_package_folder(
    request: Request,
    replace: bool = Query(False),
) -> dict[str, Any]:
    """FastAPI Router에서 필요한 ROS2 타입이나 설정을 불러오는 함수입니다."""
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


@router.get('/ros/interfaces/packages')
def get_interface_packages() -> dict[str, Any]:
    """FastAPI Router에서 요청된 처리를 수행하는 함수입니다."""
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


@router.delete('/ros/interfaces/packages/{package_name}')
def delete_ros_interface_package(package_name: str) -> dict[str, Any]:
    """FastAPI Router에서 등록 항목이나 파일을 삭제하는 함수입니다."""
    try:
        result = delete_interface_package(package_name)
    except InterfacePackageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        'success': True,
        'data': result,
        'message': 'interface package를 삭제했습니다. 적용하기로 build 상태를 갱신하세요.',
    }
