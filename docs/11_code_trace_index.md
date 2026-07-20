# 기능별 코드 위치 빠른 색인

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. 이 색인을 사용하는 방법

기능을 추적할 때는 “누가 시작하는가 → 어떤 함수가 처리하는가 → 어느 cache에
저장하는가 → 어떤 API와 화면이 읽는가” 순서로 봅니다.

## 2. Interface Lab 추적 (등록 및 상호작용)

| 기능 | 핵심 파일 | 주요 함수 |
|---|---|---|
| 인터페이스 등록/삭제 | `interface_registry.py` | `register_interface`, `delete_registry_entry` |
| 수동 정의 | `manual_interfaces.py` | `write_manual_definition`, `register_manual_type` |
| 인터페이스 빌드/적용 | `interface_apply.py` | `run_interface_apply` |
| 서비스 호출 실행 | `service/call_runtime.py` | `call_service`, `callable_services` |
| 액션 Goal 실행 | `action/goal_runtime.py` | `send_goal`, `callable_actions` |
| Topic 수신 | `interface_receive_runtime.py` | `start_topic`, `stop_topic`, `topic_history` |

## 3. Backend 시작과 모니터링 공통 흐름

| 기능 | 시작·호출 | 핵심 처리 |
|---|---|---|
| 서버 시작 | `main.py` | `RosMonitor.start` |
| Graph 반복 갱신 | `ros_monitor.py` | `RosMonitor._update_graph` |

## 4. Frontend 통합 추적

| 기능 | 상태·호출 | 주요 화면 |
|---|---|---|
| 모니터링 Polling | `usePolling.js`, `rosApi.js` | `TopicsPage`, `ServicesPage`, `ActionsPage` |
| Interface Lab | `rosApi.js` (직접 호출) | `InterfaceLabPage.jsx` |
| Interface 업로드 | `InterfaceUploadControl.jsx` | `InterfaceLabPage` |

## 5. 핵심 개념 매핑

- **full_type**: `interface_registry.py`에서 관리.
- **registry**: `backend/config/interface_registry.yaml`.
- **callable**: 등록된 서비스/액션이 import 가능하고 현재 graph에 server가 1개 이상 존재할 때 callable로 판단합니다 (`service/call_runtime.py`, `action/goal_runtime.py`). ActionClient 캐시 key는 `(action_name, action_type)` 쌍입니다.

## 6. 내가 반드시 알아야 할 것 3줄 요약

1. Backend는 '모니터링'과 'Interface Lab'이라는 두 영역으로 코드가 분리되어 있습니다.
2. Interface Lab은 직접적인 API 호출(`rosApi.js`)을 통해 실행됩니다.
3. 인터페이스 등록 로직은 `interface_registry.py`와 `manual_interfaces.py`가, 빌드 실행은 `interface_apply.py`가 담당합니다.
