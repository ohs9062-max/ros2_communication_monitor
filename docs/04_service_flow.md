# Service 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. Service의 세 가지 감시 및 실행 경로

이 대시보드에서 Service는 목적에 따라 세 가지 다른 경로로 다루어집니다.

1. **Service Graph 모니터링**: 전체 Service의 server/client 존재 여부를 Graph API로 관찰.
2. **Allowlist Active Check**: 모니터링 중, 중요한 Service에 주기적으로 요청을 보내 상태를 진단.
3. **Interface Lab 사용자 Service Call**: 사용자가 Interface Lab에서 정의한 스키마를 기반으로 직접 서비스 요청.

## 2. 모니터링 및 Allowlist 흐름

`ServiceRuntime`은 Graph API로 목록을 조사하고, `ServiceActiveCheckRuntime`이 allowlist 대상에만 `call_async()`로 비동기 요청을 보내 상태를 기록합니다.

## 3. Interface Lab: 사용자 Service Call 흐름

Interface Lab에서 이루어지는 실제 요청은 `service/call_runtime.py`가 담당합니다.

- **기능**: 사용자의 `POST /ros/interfaces/service-call` 요청을 처리.
- **처리 흐름**:
    - **Callable 판단**: `full_type` 기반으로 호출 가능한지 확인.
    - **요청 변환**: 사용자가 입력한 JSON을 ROS2 메시지 스키마에 맞게 변환 (nested, array, primitive 변환).
    - **실행**: 동적으로 생성된 요청을 ROS2 Service로 전송.
    - **결과**: JSON-safe 변환 후 응답을 `history`에 저장하고 UI로 전달.

## 4. 자주 틀리는 이해

- **모니터링과 사용자 호출은 별개입니다**: 모니터링 결과(Active Check 성공 여부)가 사용자 호출 성공을 보장하지 않습니다.
- **데이터 흐름**: 모니터링은 비동기적(async check)으로 이루어지며, 사용자 호출은 즉각적(API request)으로 이루어집니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Service는 'Graph 모니터링', '주기적 Active Check', '사용자 직접 Call'로 구분됩니다.
2. 사용자 직접 Call은 Interface Lab에서 `full_type` 기반으로 스키마 검증을 거친 후 수행됩니다.
3. 서비스 응답은 변환 과정을 거쳐 history에 저장되며, 이는 모니터링 데이터와는 별개입니다.
