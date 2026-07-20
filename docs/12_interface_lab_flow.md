# Interface Lab 흐름 및 가이드

## 1. 문서 목적
본 문서는 ROS2 대시보드의 Interface Lab 기능을 사용하여 인터페이스를 등록, 빌드, 적용하고 이를 활용해 Service Call, Action Goal 전송, Topic 수신을 수행하는 전체 흐름을 설명합니다.

## 2. Interface Lab이 맡는 역할
ROS2 시스템에서 동적으로 추가된 커스텀 인터페이스(msg, srv, action)를 시스템 재시작 없이 등록, 빌드, 적용하여 로봇과 상호작용할 수 있게 합니다.

## 3. 전체 흐름
[사용자 입력] → [파일/패키지 저장] → [CMake/package.xml 재생성] → [빌드/적용] → [인터페이스 가용성 검증] → [동적 UI 호출]

## 4. 등록 방식 4종 비교

| 방식 | 입력 형태 | 파일 생성 여부 | 저장 위치 | build 필요 여부 |
|---|---|---|---|---|
| manual_type | 이미 설치/import 가능한 full_type 직접 입력 | 없음 (registry만 기록) | `config/interface_registry.yaml` | **불필요** (이미 import 가능) |
| manual_definition | 사용자가 정의 직접 입력 | 있음 (.msg/.srv/.action 파일 생성) | `src/uploaded_interfaces/` | 필요 |
| single_upload | 단일 .msg/.srv/.action 파일 업로드 | 있음 | `src/uploaded_interfaces/` | 필요 |
| package_upload | zip 또는 폴더 형태 완전한 ROS2 패키지 | 있음 (패키지 통째로 저장) | `src/uploaded_interface_packages/` | 필요 |

## 5. registry와 저장 위치
- **registry**: `backend/config/interface_registry.yaml` (등록된 메타데이터)
- **인터페이스 보관**: `backend/src/uploaded_interfaces/` (직접 작성/단일 파일)
- **패키지 보관**: `backend/src/uploaded_interface_packages/` (완전한 패키지)

## 6. manual_type 및 manual_definition 흐름

**manual_type**: 사용자가 이미 ROS2 환경에 설치/import 가능한 full_type을 직접 입력합니다. `register_manual_type()`이 `config/interface_registry.yaml`에만 기록하고 파일 생성, CMake 수정, build는 하지 않습니다. import 가능 여부는 등록 시점에 `_check_import()`로 즉시 확인합니다.

**manual_definition**: 사용자가 .msg/.srv/.action 정의를 직접 입력합니다. `write_manual_definition()`이 `src/uploaded_interfaces/` 하위에 파일을 쓰고, `manual_interfaces.py`의 `regenerate_uploaded_interfaces_package()`로 CMakeLists.txt와 package.xml을 전체 재생성한 뒤 registry를 갱신합니다. 이후 apply/build가 필요합니다.

## 7. single_upload 및 package_upload 흐름
파일이나 폴더를 업로드하면 서버는 이를 검증하고 지정된 저장 위치로 이동시킨 후, 전체 인터페이스 스캔을 통해 빌드 시스템 파일들을 업데이트합니다.

## 8. CMakeLists.txt와 package.xml 재생성

CMakeLists.txt와 package.xml 재생성은 `manual_interfaces.py`의 `regenerate_uploaded_interfaces_package()`가 담당합니다. `interface_apply.py`는 빌드를 실행할 뿐이고 CMake/package.xml을 직접 재생성하지 않습니다.

재생성 시점: manual_definition 작성/수정/삭제, single_upload 파일 저장/삭제 시.

- `scan_uploaded_interface_files()`로 실제 남은 파일 목록을 다시 스캔합니다.
- `regenerate_uploaded_interfaces_cmake()`: CMakeLists.txt를 전체 새로 씁니다 (append 방식 아님).
- `regenerate_uploaded_interfaces_package_xml()`: package.xml도 전체 새로 씁니다.
- 인터페이스 파일이 0개이면 `rosidl_generate_interfaces()` 호출을 남기지 않고 빈 ament_cmake 패키지로 유지합니다.

## 9. apply/build/import 흐름
1. `POST /ros/interfaces/apply` 호출.
2. `colcon build` 수행.
3. `import check`로 파이썬 사용 가능 여부 검증.

## 10. callable Service/Action 판단

`service/call_runtime.py`의 `_allowed_service()` 및 `action/goal_runtime.py`의 `_allowed_action()`이 판단합니다.

조건:
1. `config/interface_registry.yaml` 또는 `config/interface_packages.yaml`에 등록되어 있을 것.
2. 빌드 후 Python import가 가능한 상태(`import_available=True`)일 것.
3. 현재 ROS2 graph에서 동일 `(service_name, full_type)` 또는 `(action_name, full_type)` exact match로 server가 1개 이상 존재할 것.

세 조건을 모두 만족해야 `callable: true`가 됩니다. 이름만 일치하고 full_type이 다르면 callable이 되지 않습니다.

## 11. Service Call 및 Action Goal 전체 흐름
`full_type` 기반으로 요청 스키마를 동적으로 생성하고, 사용자가 입력한 데이터를 변환(primitive, nested, array)하여 Backend가 ROS2 Service/Action으로 전달합니다.

## 12. Topic Receive 흐름
사용자가 특정 Topic 구독을 시작하면, 모니터링 구독과는 별개의 Runtime에서 메시지를 수신하여 preview 및 history를 관리합니다.

## 13. 전체 흐름 한 문장
사용자가 인터페이스를 등록/업로드하면 Backend가 빌드 시스템을 재생성하여 ROS2 환경에 적용하고, 검증된 스키마를 통해 서비스/액션/토픽의 동적 상호작용을 제공합니다.

## 14. 초보자가 자주 틀리는 부분
- **manual_type은 build 없이도 즉시 사용 가능**: 이미 설치된 type을 registry에 등록만 하므로 apply/build가 필요 없습니다.
- **manual_definition/single_upload/package_upload는 Apply/Build가 필요**: 파일을 생성했더라도 `colcon build` 없이는 Python에서 import할 수 없어 callable이 되지 않습니다.
- **full_type** 매칭이 아닌 이름만으로 매칭 시도하면 타입 오류가 발생합니다.
- **CMake 재생성은 interface_apply.py가 아닌 manual_interfaces.py**가 담당합니다.

## 15. 내가 반드시 알아야 할 것 3줄 요약
1. `manual_type`은 파일을 생성하지 않고 registry만 기록하므로 build가 필요 없습니다. 나머지 3종은 파일을 생성하므로 apply/build가 필요합니다.
2. CMakeLists.txt와 package.xml 재생성은 `manual_interfaces.py`가, colcon build 실행은 `interface_apply.py`가 담당합니다.
3. callable 판단은 registry 등록 + import 가능 + graph server 존재 세 조건을 모두 만족해야 합니다.
