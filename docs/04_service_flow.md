# Service 모니터링 흐름

> 라인 번호는 2026-07-14 실제 코드 기준이다.

## 1. Service를 안전하게 감시하는 방법

Service는 요청이 있을 때만 응답하므로 Topic처럼 메시지 Hz를 재지 않습니다.
`ServiceRuntime`은 먼저 Graph API로 server/client 존재 여부를 조사합니다. 실제
request를 보내는 **active check**는 `monitor.yaml` allowlist에 등록된 안전한
Service에만 수행합니다.

## 2. Graph 목록 만들기

```text
RosMonitor가 Service 갱신 호출
  — ros_monitor.py L304-L307
  — RosMonitor._update_graph() → ServiceRuntime.update()

→ Service 이름과 type 조회
  — service/runtime.py L86-L104
  — node.get_service_names_and_types()

→ server/client 수, category, 상태 조립
  — service/runtime.py L104-L119
  — service/discovery.py L17-L57, build_service_item()

→ 이전 active-check 결과를 item에 병합
  — service/runtime.py L94-L119
  — ServiceActiveCheckRuntime.cache_snapshot()

→ Service 목록 cache 저장과 목록 반환
  — service/runtime.py L121-L127
  — self._services, self._last_updated
```

`ServiceRuntime.update()`는 인자를 받지 않고 `node_getter()`로 Node를 얻습니다.
완성한 `services`는 cache에 저장하는 동시에 `RosMonitor._update_graph()`로
반환됩니다. `count_clients()`가 없는 rclpy 환경은 0으로 처리하므로 0이 반드시
client 부재를 확정하지는 않습니다(`service/runtime.py` L136-L155).

parameter, action 내부, ROS 내부 Service 분류는 `service/filters.py` L30-L64에서
정합니다. 기본 `GET /ros/services`는 숨김 항목을 제외하고,
`?include_hidden=true`는 전체 cache를 반환합니다.

## 3. allowlist active check

Graph에서 server가 보인다는 사실은 실제 request 성공을 보장하지 않습니다. active
check는 허용된 Service에 request를 보내 응답과 시간을 확인합니다.

```text
Graph 갱신이 반환한 services를 active-check Runtime에 전달
  — ros_monitor.py L307-L309
  — ServiceRuntime.update_active_checks(services)

→ 완료 Future와 timeout 먼저 확인
  — active_check_runtime.py L60-L104
  — ServiceActiveCheckRuntime.update()

→ allowlist, type, server, 기존 pending 검사
  — active_check_runtime.py L147-L169
  — _maybe_start_active_check(service, now)

→ request와 client 생성 후 call_async()
  — active_check_runtime.py L170-L205

→ Future와 pending 상태를 cache에 저장
  — active_check_runtime.py L194-L214

→ 완료 callback 또는 다음 update에서 결과 기록
  — active_check_runtime.py L76-L145

→ 다음 ServiceRuntime.update()가 public item에 병합
  — service/runtime.py L94-L119
```

`_update_graph()` 흐름은 일반 동기 함수 호출이지만 실제 Service 요청은
`call_async()`를 사용합니다. 이 함수가 나중에 완료될 결과인 Future를 즉시
반환하므로 `async def`가 없어도 응답을 기다리지 않고 진행합니다. request type과
field 조립은 `service/active_check.py` L201-L213에 있습니다.

allowlist 밖 Service에는 request를 보내지 않으며, `active_check_supported=false`는
장애가 아니라 검사 정책 대상이 아니라는 뜻입니다.

## 4. REST, Alert, 화면 전달

```text
ServiceRuntime.snapshot(include_hidden)
  — service/runtime.py L54-L79
→ RosMonitor.service_snapshot()
  — ros_monitor.py L99-L107
→ GET /ros/services
  — main.py L81-L95
→ Frontend polling과 화면
  — rosApi.js L42-L45
  — useServiceDashboard.js L9-L76
  — ServicesPage.jsx L73-L231
```

Service Alert 입력은 `ServiceRuntime.alert_snapshot()` L81-L84가 만들고,
`build_service_alerts()`는 visible user Service의 allowlist active check가 timeout,
error, failed일 때만 Alert를 만듭니다(`service/alerts.py` L37-L88). 단순
`waiting_server`는 기본 Alert가 아닙니다.

## 5. 전체 흐름 한 문장

ServiceRuntime이 모든 Service를 Graph로 관찰하고 allowlist 대상만 비동기 request로
확인한 뒤 결과 cache를 REST와 Alert에 전달합니다.

## 초보자가 자주 틀리는 부분

- `active`는 server 발견이며 request 성공이라는 뜻이 아닙니다.
- REST endpoint가 active check를 직접 시작하지 않습니다.
- Future의 `pending`은 아직 응답 대기 중인 상태이지 실패가 아닙니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. Service 기본 상태는 Graph의 server/client 관계로 판단합니다.
2. 실제 request는 allowlist 대상에만 `call_async()`로 보냅니다.
3. 응답은 cache에 기록되고 다음 Service item에 병합됩니다.
