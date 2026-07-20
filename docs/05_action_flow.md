# Action 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. Action의 두 가지 감시 및 실행 경로

이 대시보드에서 Action은 목적에 따라 두 가지 다른 경로로 다루어집니다.

1. **Action 모니터링**: Action server/client 존재 여부, Goal 상태, Feedback, 관찰된 Goal의 Result를 자동으로 감시.
2. **Interface Lab Action Goal**: 사용자가 Interface Lab에서 정의한 스키마를 기반으로 Action Goal을 전송.

## 2. Action 모니터링 흐름

`ActionRuntime`이 Action server/client와 status/feedback을 관찰하고, `ActionResultRuntime`은 status에서 실제로 본 종료 Goal만 result를 조회합니다.

## 3. Interface Lab: 사용자 Action Goal 흐름

Interface Lab에서 이루어지는 실제 요청은 `action/goal_runtime.py`가 담당합니다.

- **기능**: 사용자의 `POST /ros/interfaces/action-goal` 요청을 처리.
- **처리 흐름**:
    - **Callable 판단**: `full_type` 기반으로 호출 가능한지 확인.
    - **스키마 매칭**: `(action_name, full_type)` exact match 확인. ActionClient 캐시는 이 정보로 분리됩니다.
    - **요청 변환**: 사용자가 입력한 JSON을 ROS2 Action Goal 스키마에 맞게 변환.
    - **실행**: `ActionClient`를 통해 Goal 전송.
    - **상태 처리**: 전송 후 feedback 및 result를 모니터링하며 history에 저장.

## 4. 모니터링 vs 사용자 실행

| 구분 | 모니터링 (Monitor) | 사용자 실행 (Interface Lab) |
|---|---|---|
| 역할 | 상태 관찰 전용 | Goal 전송 및 결과 확인 |
| 데이터 | `snapshot` | `history`, `sent_to_server`, `validation_error` |
| 매칭 | 이름 기준 관찰 | `(name, full_type)` exact match |

## 5. 자주 틀리는 이해

- **이 모니터링은 전용입니다**: 모니터링 흐름만으로는 Action Goal을 전송할 수 없습니다.
- **ActionClient 관리**: Interface Lab의 ActionClient는 `(action_name, full_type)` 단위로 캐시되어 분리 관리됩니다.
- **결과 계산**: 관찰된 `exact-type server/client` 수는 시스템 전체 상황을 보여주며, 사용자 실행 성공과는 독립적입니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Action은 '상태 관찰 모니터링'과 '사용자 Goal 전송(Interface Lab)'으로 구분됩니다.
2. 사용자 Goal 전송 시 `(action_name, full_type)`을 기준으로 정확하게 매칭해야 합니다.
3. 모니터링의 status/feedback 캐시와 Interface Lab의 history/sent_to_server 캐시는 별개입니다.
