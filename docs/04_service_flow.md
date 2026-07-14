# Service 모니터링 흐름

> 라인 번호는 2026-07-13 문서 작성 시점의 현재 코드 기준이다.

## 1. 범위와 한 줄 요약

Service 발견, server/client count, category/숨김 정책, allowlist active check,
REST와 Alert 흐름을 설명한다.

`ServiceRuntime`이 Graph snapshot을 소유하고, 내부의
`ServiceActiveCheckRuntime`만 허용된 Service를 비동기로 호출한다.

## 2. 전체 흐름

```text
ServiceRuntime.update
→ Service Graph/count/category 조립
→ active-check cache 병합
→ public snapshot

ServiceRuntime.update_active_checks
→ allowlist/type/server 확인
→ request + call_async
→ pending/timeout/failed/error/success cache
```

## 3. Graph와 public snapshot 코드 위치

| 단계 | 설명 | 파일 | 라인 | 함수/클래스 |
|---|---|---|---|---|
| 1 | active-check runtime 조립 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/runtime.py` | L24-L44 | `ServiceRuntime.__init__` |
| 2 | Service names/types 조회 | 같은 파일 | L86-L104 | `ServiceRuntime.update` |
| 3 | server/client count 계산 | 같은 파일 | L104-L118 | `update`, `_client_count` |
| 4 | public item과 active-check cache 병합 | 같은 파일 | L94-L119 | `ServiceRuntime.update` |
| 5 | 전체 cache 저장 | 같은 파일 | L121-L127 | `ServiceRuntime.update` |
| 6 | 숨김 포함 여부와 meta 조립 | 같은 파일 | L54-L79 | `ServiceRuntime.snapshot` |
| 7 | active check 진행 위임 | 같은 파일 | L129-L134 | `update_active_checks` |

`count_clients`가 없는 rclpy 환경은 `service/runtime.py` L136-L155에서
0으로 안전 처리한다. 이는 “client가 확실히 없다”가 아니라 해당 환경에서
count API를 쓸 수 없을 가능성도 포함한다.

## 4. category와 숨김 정책

| 단계 | 파일 | 라인 | 함수 |
|---|---|---|---|
| 내부 종류 판정 | `backend/.../service/filters.py` | L16-L42 | `is_parameter_service` 외 |
| category 결정 | 같은 파일 | L45-L59 | `service_category` |
| 기본 숨김 여부 | 같은 파일 | L62-L64 | `is_hidden_by_default` |
| Service item 조립 | `backend/.../service/discovery.py` | L17-L57 | `build_service_item` |
| visible/all meta | `backend/.../service/models.py` | L65-L145 | `service_meta` |

category는 `user`, `parameter`, `action_internal`, `ros_internal`, `unknown`이다.
`GET /ros/services`는 기본 숨김 item을 제외하고,
`?include_hidden=true`일 때 cache 전체를 반환한다.

## 5. Active check 상세 흐름

| 단계 | 설명 | 파일 | 라인 | 함수 |
|---|---|---|---|---|
| 1 | YAML allowlist를 name map으로 변환 | `backend/.../service/active_check_runtime.py` | L22-L37 | `ServiceActiveCheckRuntime.__init__` |
| 2 | 주기/활성 여부 판단 | 같은 파일 | L60-L74 | `update` |
| 3 | 완료 future/timeout 처리 | 같은 파일 | L76-L104 | `_complete_active_check_futures` |
| 4 | allowlist/type/server/pending 검사 | 같은 파일 | L147-L169 | `_maybe_start_active_check` |
| 5 | request와 client 생성, async 호출 | 같은 파일 | L170-L205 | `_maybe_start_active_check` |
| 6 | done callback 등록 | 같은 파일 | L206-L214 | `_maybe_start_active_check` |
| 7 | success/failed/error cache 저장 | 같은 파일 | L106-L145 | `_record_active_check_done` |
| 8 | rclpy client 재사용 | 같은 파일 | L232-L243 | `_active_check_client` |

request class 로드와 field 설정은 `service/active_check.py` L201-L213,
응답 성공 판정은 L165-L199와 L224-L237에 있다. 실제 허용 목록은
`backend/config/monitor.yaml` L36-L53이다.

## 6. REST, Alert, Frontend 연결

- REST: `main.py` L81-L95 `get_ros_services`
- coordinator 위임: `ros_monitor.py` L99-L107 `service_snapshot`
- Alert 입력: `service/runtime.py` L81-L84 `alert_snapshot`
- Alert builder: `service/alerts.py` L18-L88
- API 호출: `frontend/src/api/rosApi.js` L42-L45
- polling/participant map: `useServiceDashboard.js` L9-L76
- filter/선택: `ServicesPage.jsx` L73-L231
- 표/상세: `ServiceTable.jsx` L35-L105,
  `ServiceDetailPanel.jsx` L5-L116

Service Alert는 user이며 기본 숨김이 아니고 active-check 대상인 Service의
`timeout`, `error`, `failed`만 만든다(`service/alerts.py` L37-L88).
단순 `waiting_server`나 “상태만 표시”는 Alert가 아니다.

## 7. 발표 때 설명할 문장

“Service 목록은 전부 Graph로 안전하게 관찰하고, 실제 request는 YAML
allowlist에 등록된 테스트 가능한 Service만 비동기로 보냅니다.”

## 8. 헷갈리기 쉬운 부분

- Service Graph의 `active`는 server 존재를 뜻하며 request 성공을 뜻하지 않는다.
- `active_check_supported=false`는 장애가 아니라 호출 정책 대상 밖이라는 뜻이다.
- endpoint는 Service를 호출하지 않고 이전 background 결과 cache만 반환한다.

## 9. 관련 파일 빠른 참조

`service/runtime.py`, `service/active_check_runtime.py`,
`service/active_check.py`, `service/filters.py`, `service/discovery.py`,
`service/models.py`, `service/alerts.py`, `monitor.yaml`
