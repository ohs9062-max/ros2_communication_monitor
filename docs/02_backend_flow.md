# Backend 전체 흐름

> 라인 번호는 2026-07-14 실제 코드 재검증 기준이다.

## 1. 이 문서에서 설명하는 것

이 문서는 Backend 서버의 전체적인 실행 흐름을 설명합니다. 크게 두 가지 독립적인 흐름이 공존합니다.

1. **모니터링 흐름**: ROS2 상태를 주기적으로 감시하여 캐시에 저장하고 API로 제공.
2. **Interface Lab 실행 흐름**: 사용자의 인터페이스 등록/작성 요청을 받아 빌드하고, 이를 활용해 서비스/액션/토픽 상호작용 실행.

## 2. 서버 실행 및 구조

FastAPI 서버가 시작되면 `RosMonitor`가 감시 작업을 조정하고, Interface Lab 관련 모듈들이 인터페이스 관리 기능을 제공합니다.

- `main.py`: 모든 엔드포인트 정의 및 FastAPI 앱 설정.
- `RosMonitor`: 모니터링 흐름 조정 (timer, spin thread, Runtime).
- `interface_registry.py`, `interface_apply.py`: Interface Lab의 핵심 관리 로직.
- `service/call_runtime.py`, `action/goal_runtime.py`: Interface Lab의 실행 로직.

## 3. 두 가지 핵심 흐름

### 3-1. 모니터링 흐름
- `RosMonitor`가 시작될 때 생성된 rclpy Node와 spin thread가 주기적으로 `_update_graph()`를 호출합니다.
- 네 Runtime(`Topic`, `Service`, `Action`, `Node`)이 Graph API를 사용해 데이터를 수집하고 Runtime Cache를 갱신합니다.
- REST 및 WebSocket 요청은 이 캐시에서 안전하게 데이터를 읽어(snapshot) 반환합니다.

### 3-2. Interface Lab 실행 흐름
- **등록**: 사용자가 인터페이스 업로드/작성 요청을 하면 `interface_registry.py`를 통해 저장되고 registry가 갱신됩니다.
- **빌드/적용**: `manual_interfaces.py`의 `regenerate_uploaded_interfaces_package()`가 CMakeLists.txt와 package.xml을 재생성하고(파일 저장/삭제 시점), `interface_apply.py`의 `run_interface_apply()`가 `colcon build --symlink-install`을 실행하여 ROS2 환경에 인터페이스를 적용합니다.
- **실행**: Interface Lab을 통해 요청되는 서비스/액션 호출은 별도의 `CallRuntime`에서 처리되어 `history`에 저장됩니다.

## 4. API 엔드포인트 분류

| 분류 | 관련 엔드포인트 예시 | 담당 모듈 |
|---|---|---|
| 모니터링 | `GET /ros/topics`, `GET /ros/services` | `RosMonitor` / `Runtime` |
| Interface 등록 | `POST /ros/interfaces/upload` | `interface_registry.py` |
| Interface 빌드 | `POST /ros/interfaces/apply` | `interface_apply.py` |
| 상호작용(실행) | `POST /ros/interfaces/service-call` | `service/call_runtime.py` |

## 5. 자주 틀리는 이해

- **REST 요청은 Graph를 갱신하지 않습니다**: REST는 모니터링 흐름에서 이미 갱신된 캐시를 읽습니다.
- **모니터링과 실행은 별개입니다**: 모니터링 캐시가 갱신되는 주기와 사용자의 서비스/액션 호출 주기는 서로 독립입니다.
- **빌드/적용 과정의 중요성**: Interface Lab에서 파일을 등록한 후 `apply/build` 과정을 거치지 않으면 ROS2에서 해당 인터페이스를 사용할 수 없습니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Backend는 '감시(모니터링)'와 '상호작용(Interface Lab)'이라는 두 가지 독립된 역할을 수행합니다.
2. 모니터링은 주기적인 Runtime Cache 갱신 흐름을 따르고, 실행은 API 요청 기반의 즉각적인 처리 흐름을 따릅니다.
3. `manual_definition`, `single_upload`, `package_upload` 방식으로 등록한 인터페이스 파일 변경은 `registry` 갱신과 `apply/build` 과정을 거쳐야 실제 ROS2 환경에 반영됩니다. `manual_type`은 파일 생성이 없으므로 build가 필요 없습니다.
