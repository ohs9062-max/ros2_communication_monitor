# Interface Lab 흐름

## 1. 문서 목적
이 문서는 ROS2 인터페이스를 동적으로 등록, 작성, 관리하고 이를 활용하여 Service Call 및 Action Goal을 전송하는 Interface Lab의 전체 흐름을 설명합니다.

## 2. 기능이 필요한 이유
사용자가 정의한 ROS2 인터페이스(msg, srv, action)를 실시간으로 대시보드에 반영하고, 이를 기반으로 로봇과 상호작용하기 위해 필요합니다.

## 3. 전체 흐름
1. **등록/작성**: 사용자가 인터페이스 파일 또는 패키지를 업로드합니다.
2. **저장/갱신**: 파일이 지정된 위치에 저장되고 `interface_registry.yaml`이 갱신됩니다.
3. **빌드/적용**: `interface_apply` 모듈이 CMake와 package.xml을 재생성하고 변경 사항을 적용합니다.
4. **검증**: `import_check`를 통해 Python에서 인터페이스를 사용할 수 있는지 확인합니다.
5. **활용**: 등록된 인터페이스를 기반으로 동적 UI가 생성되어 Service Call 및 Action Goal 전송이 가능해집니다.

## 4. 단계별 코드 위치
- **등록/작성**: `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_registry.py` (`register_interface`), `manual_interfaces.py` (`write_manual_definition`)
- **빌드/적용**: `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_apply.py`
- **검증**: `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/interface_registry.py` (`_check_import`)
- **활용**: `frontend/src/pages/InterfaceLabPage.jsx` 및 `frontend/src/api/rosApi.js`

## 5. 저장 위치
- **registry**: `config/interface_registry.yaml`
- **인터페이스 파일**: `src/uploaded_interfaces/` (단일 업로드/작성), `src/uploaded_interface_packages/` (전체 패키지 업로드)

## 6. REST/API 전달
- **목록 조회**: `GET /ros/interfaces/registry`
- **적용 상태**: `GET /ros/interfaces/apply/status`
- **Service Call/Action Goal**: `POST /ros/interfaces/service-call`, `POST /ros/interfaces/action-goal`

## 7. Frontend 전달
- **상태 관리**: `frontend/src/pages/InterfaceLabPage.jsx`의 `registry`, `applyStatus` state.
- **UI**: `InterfaceUploadControl.jsx` (업로드 제어), 각 도메인 패널.

## 8. 전체 흐름 한 문장
사용자가 인터페이스를 업로드하고 적용하면 Backend가 빌드 및 검증을 거쳐 동적 UI를 위한 API를 제공합니다.

## 9. 초보자가 자주 틀리는 부분
- **Full Type 매칭**: 인터페이스 이름만으로는 부족하며 패키지명까지 포함한 `full_type`이 일치해야 합니다.
- **빌드 필요**: 인터페이스 파일이 변경되면 반드시 `apply`를 수행하고 빌드 과정을 거쳐야 import가 가능합니다.
- **타입 충돌**: 동일한 이름의 인터페이스라도 패키지가 다르면 다른 타입으로 취급됩니다.

## 10. 내가 반드시 알아야 할 것 3줄 요약
1. Interface Lab은 `full_type` 기준으로 인터페이스를 관리하며, 이름만으로 매칭하면 오류가 발생할 수 있습니다.
2. 모든 인터페이스 파일 변경은 registry 갱신, 빌드 시스템 파일(CMake, package.xml) 수정, import 검증 단계를 거칩니다.
3. 서비스 호출 및 액션 실행은 등록된 인터페이스의 스키마를 기반으로 동적으로 생성됩니다.
