# Backend 전체 흐름

> 라인 번호는 2026-07-14 실제 코드 재검증 기준이다.

## 1. 이 문서에서 설명하는 것

이 문서는 Backend 서버를 실행했을 때 어떤 객체가 만들어지고, ROS2 정보가 어떻게
수집되어 REST API와 WebSocket으로 전달되는지를 시작부터 종료까지 설명합니다.

전체 흐름을 먼저 한 문장으로 보면 다음과 같습니다.

FastAPI 서버가 시작되면 `RosMonitor`가 ROS2 감시 작업을 시작하고, 네 Runtime이
주기적으로 메모리의 최신 상태를 갱신하며, REST와 WebSocket은 그 결과를 읽어
Frontend에 전달합니다.

여기서 `RosMonitor`는 여러 감시 기능의 시작, 종료, 실행 순서를 조정하는
**coordinator(조정자)**입니다. **Runtime**은 서버가 실행되는 동안 Topic, Service,
Action, Node 중 하나의 상태와 처리 기능을 맡는 객체입니다.

## 2. 서버가 시작해서 종료될 때까지

Uvicorn은 FastAPI 애플리케이션을 실행하는 서버 프로그램입니다. Uvicorn이
`main.py`를 불러오면 Python은 파일의 위쪽부터 코드를 실행합니다. 설정을 읽고,
`RosMonitor`와 `WebSocketManager` 객체를 만든 뒤 FastAPI 객체 `app`을 생성합니다.

FastAPI 객체를 만들 때 `lifespan`을 등록합니다. **lifespan**은 FastAPI 서버가
시작될 때 실행할 작업과 종료될 때 실행할 작업을 한곳에 묶는 시작·종료 관리
함수입니다. 이 프로젝트에서는 시작할 때 `ros_monitor.start()`를 실행하고,
서버가 종료될 때 `ros_monitor.stop()`을 실행합니다.

실제 실행 순서는 다음과 같습니다.

```text
Uvicorn 실행
  — backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py 모듈 로드
→ Uvicorn이 main.py 불러오기
  — main.py 모듈 전체
→ main.py가 설정, ros_monitor, websocket_manager 객체 생성
  — main.py L15-L18
→ main.py가 lifespan을 등록한 FastAPI app 생성
  — main.py L21-L31, lifespan(), FastAPI(...)
→ FastAPI가 lifespan 시작
  — main.py L22-L28, lifespan()
→ lifespan이 ros_monitor.start() 호출
  — main.py L24, ros_monitor.py L59-L73
→ RosMonitor.start()가 ROS2 Node 생성
  — ros_monitor.py L64-L65
→ 정해진 시간마다 실행할 timer 등록
  — ros_monitor.py L66-L69, Node.create_timer()
→ RosMonitor.start()가 _update_graph() 최초 1회 직접 호출
  — ros_monitor.py L70
→ RosMonitor.start()가 ROS2 spin thread 시작
  — ros_monitor.py L72-L73
→ timer가 _update_graph() 반복 호출
  — ros_monitor.py L66-L69, L304-L309
→ 네 Runtime이 각자의 cache 갱신
  — ros_monitor.py L304-L309, 각 도메인 runtime.py
→ REST와 WebSocket이 cache의 snapshot을 읽어 전달
  — main.py L54-L147, ros_monitor.py L95-L146
→ 서버 종료 시 lifespan이 ros_monitor.stop() 호출
  — main.py L25-L28, ros_monitor.py L75-L93
```

**timer**는 정해진 시간 간격마다 등록된 함수를 실행하게 하는 ROS2 기능입니다.
`RosMonitor.start()`는 `poll_interval_sec`을 간격으로 사용하고 `_update_graph`를
timer에 넘깁니다. 이처럼 나중에 자동으로 호출되도록 전달하는 함수를
**callback(콜백)**이라고 합니다.

다만 timer가 실제로 callback을 실행하려면 ROS2가 이벤트를 처리하는 상태여야
합니다. 뒤에서 설명할 `rclpy.spin()`이 이 역할을 담당합니다.

관련 코드는 객체 생성 `main.py` L15-L18, lifespan과 FastAPI 등록 L21-L31,
`RosMonitor` 초기화 `ros_monitor.py` L23-L57, 시작 L59-L73, 종료 L75-L93에서
찾을 수 있습니다.

기술적으로 `main.py` L17의 `ros_monitor`는 `RosMonitor` 클래스에서 만든 실제
객체입니다. `RosMonitor`라는 클래스는 객체의 구조와 동작을 정의한 설계도이고,
`RosMonitor(backend_config.monitor)`는 그 설계도로 객체를 만드는 호출입니다.
설정은 `main.py` L16에서 한 번 읽어 생성자에 전달하므로 `RosMonitor`가 설정 파일을
다시 읽지는 않습니다.

자주 틀리는 이해는 Uvicorn이 ROS2를 직접 감시한다고 생각하는 것입니다. Uvicorn과
FastAPI는 웹 요청을 담당하고, 실제 ROS2 Node 생성과 감시는 `RosMonitor`가
시작한 rclpy 작업이 담당합니다.

## 3. RosMonitor와 네 Runtime의 관계

`RosMonitor`가 Topic, Service, Action, Node의 세부 로직을 한 클래스 안에서 모두
처리하지는 않습니다. 각 영역의 Runtime 객체를 만들고 필요한 순서에 맞춰 호출합니다.

Topic을 예로 들면 다음과 같습니다.

- `TopicRuntime`은 Topic 감시 객체의 구조를 정의한 클래스 설계도입니다.
- `TopicRuntime(...)`은 그 클래스로 실제 객체를 생성하는 호출입니다.
- `self._topic_runtime`은 생성된 객체를 이후에도 사용할 수 있도록 보관한 참조입니다.
- `RosMonitor`는 Topic Graph를 직접 조립하지 않고
  `self._topic_runtime.update()`를 호출합니다.
- Topic 목록을 반환할 때도 직접 cache를 읽지 않고
  `self._topic_runtime.snapshot()`에 맡깁니다.

`ServiceRuntime`, `ActionRuntime`, `NodeRuntime`도 같은 구조입니다.

각 Runtime에는 설정, 하나의 공용 `Lock`, 그리고 `node_getter`가 전달됩니다.
**node_getter**는 현재 ROS2 Node를 필요할 때 가져오는 함수입니다.
`node_getter=lambda: self._node`에서 **lambda**는 짧은 이름 없는 함수를 만드는
Python 문법입니다. Runtime 생성 당시의 `None`을 고정해서 넘기는 것이 아니라,
Runtime이 호출하는 순간의 최신 `self._node`를 반환합니다.

생성 위치와 책임은 `ros_monitor.py`의 Action L32-L36, Topic L37-L44, Node
L45-L52, Service L53-L57입니다. 각각 Action event/result, Topic 구독/latest/Hz,
Node 관계/stale, Service Graph/active check 상태를 맡습니다.

Runtime은 별도의 ROS2 Node를 만들지 않습니다. 네 객체 모두 `RosMonitor`가 만든
하나의 Node를 `node_getter`를 통해 공유합니다.

## 4. ROS2 spin thread가 필요한 이유

**thread(스레드)**는 하나의 프로그램 안에서 별도로 진행되는 작업 흐름입니다.
이 Backend에는 크게 두 실행 흐름이 함께 필요합니다.

- FastAPI 쪽은 REST와 WebSocket 같은 웹 요청을 처리합니다.
- ROS2 spin thread는 timer와 Topic subscription callback 같은 ROS2 이벤트를
  처리합니다.

`rclpy.spin()`은 Node의 이벤트를 계속 기다리며 처리합니다. 이를 FastAPI와 같은
실행 흐름에서 그대로 실행하면 spin이 계속 대기하는 동안 웹 요청 처리를 막을 수
있습니다. 그래서 `RosMonitor.start()`는 별도 thread를 만들고 시작합니다.

```python
self._thread = Thread(target=self._spin, daemon=True)
self._thread.start()
```

`start()`는 thread를 만들어 시작할 뿐입니다. 새 thread에서 실제로 계속 실행되는
함수는 `_spin()`이며, `_spin()`이 `rclpy.spin(self._node)`를 호출합니다.

실행 순서는 `start()`가 `_spin`을 thread의 실행 함수로 등록하고 thread를 시작한
뒤, 새 thread가 `_spin()` → `rclpy.spin()`을 호출하는 순서입니다. thread 생성은
`ros_monitor.py` L72-L73, 실제 spin은 L292-L302에 있습니다.

자주 틀리는 이해는 `RosMonitor.start()` 함수 자체가 계속 반복 실행된다고 보는
것입니다. `start()`는 준비를 마치면 끝나고, 이후 계속 실행되는 작업은 별도
thread의 `_spin()`과 `rclpy.spin()`입니다.

## 5. ROS2 Graph와 Runtime cache 갱신

ROS2의 **Graph API**는 현재 어떤 Node, Topic, Service, Action이 존재하고 서로 어떻게
연결되어 있는지를 rclpy 코드로 조회하는 기능입니다. 이 프로젝트는 ROS2 CLI
문자열을 분석하지 않고 각 Runtime이 Graph API를 사용해 현재 상태를 확인합니다.

**cache(캐시)**는 이렇게 확인한 최신 상태를 다시 사용할 수 있도록 메모리에 보관한
값입니다. `RosMonitor.start()`는 timer가 시작되기 전에 `_update_graph()`를 한 번
직접 호출하여 초기 cache를 채웁니다. 이후에는 spin thread가 timer 이벤트를
처리할 때마다 `_update_graph()`가 다시 호출됩니다.

```text
_update_graph()
  — ros_monitor.py L304-L309, RosMonitor._update_graph()
→ self._node_runtime.update()
  — node/runtime.py L69-L147, NodeRuntime.update()
→ self._topic_runtime.update()
  — topic/runtime.py L101-L158, TopicRuntime.update()
→ services = self._service_runtime.update()
  — service/runtime.py L86-L127, ServiceRuntime.update()
→ self._action_runtime.update()
  — action/runtime.py L84-L137, ActionRuntime.update()
→ self._service_runtime.update_active_checks(services)
  — service/runtime.py L129-L134
```

이 순서는 `ros_monitor.py` L304-L309에 그대로 정의되어 있습니다.

Service active check는 Graph에서 server가 보이는지만 확인하는 것보다 한 단계 더
나아가, allowlist에 등록된 안전한 Service에 실제 요청을 보내 응답을 확인하는
기능입니다. `_update_graph()` 자체와 각 Runtime의 `update()` 호출 흐름은 일반적인
동기 함수 호출입니다. 실제 Service 요청 부분만 `call_async()`를 사용합니다.

`async def` 문법이 없어도 `call_async()`는 나중에 도착할 결과를 나타내는
`Future`를 바로 반환합니다. 따라서 응답이 올 때까지 `_update_graph()` 전체를
멈추지 않고 다음 작업으로 진행할 수 있습니다. 완료 또는 timeout 결과는
active-check cache에 기록되고, 다음 `ServiceRuntime.update()`가 Service 공개
항목에 병합합니다.

**Lock(락)**은 여러 실행 흐름이 공유 데이터를 동시에 읽고 수정할 때 한쪽 작업이
끝날 때까지 다른 쪽의 접근을 잠시 막는 보호 장치입니다. 설계상 Runtime이 cache를
만들고 FastAPI가 그 cache를 읽습니다. Lock 때문에 cache 구조를 사용하는 것이
아닙니다. Lock은 ROS2 thread가 cache를 갱신하는 중에 FastAPI가 절반만 바뀐 목록을
읽지 않도록 보호합니다.

## 6. REST endpoint가 cache를 읽는 방법

**endpoint(엔드포인트)**는 외부에서 요청할 수 있도록 FastAPI에 등록한 API 경로와
처리 함수입니다. 예를 들어 `GET /ros/topics` 요청이 오면 FastAPI가
`get_ros_topics()`를 호출합니다. 이 함수는 ROS2 Graph를 새로 조회하지 않고
`ros_monitor.snapshot()`을 호출합니다.

**snapshot(스냅샷)**은 Runtime cache의 현재 내용을 API가 안전하게 읽을 수 있도록
복사해 만든 한 시점의 데이터입니다. snapshot을 만든다는 말은 Graph API를 다시
호출한다는 뜻이 아닙니다.

```text
Frontend가 GET /ros/topics 요청
  — frontend/src/api/rosApi.js L26-L28, fetchTopics()
→ FastAPI가 get_ros_topics() endpoint 함수 호출
  — main.py L54-L66
→ get_ros_topics()가 ros_monitor.snapshot() 호출
  — main.py L57, ros_monitor.py L95-L97
→ RosMonitor가 self._topic_runtime.snapshot()에 위임
  — ros_monitor.py L95-L97
→ TopicRuntime이 Lock으로 보호된 cache 복사본 반환
  — topic/runtime.py L70-L80
→ main.py가 기존 응답 key로 조립해 Frontend에 반환
  — main.py L58-L66
```

| API 경로 | endpoint 함수 | RosMonitor 호출 | 코드 위치 |
|---|---|---|---|
| `GET /ros/topics` | `get_ros_topics` | `snapshot` | `main.py` L54-L66 |
| `GET /ros/topics/latest` | `get_latest_ros_topic` | `latest_message` | L69-L72 |
| `GET /ros/topics/hz` | `get_ros_topic_hz` | `topic_hz` | L75-L78 |
| `GET /ros/services` | `get_ros_services` | `service_snapshot` | L81-L95 |
| `GET /ros/actions` | `get_ros_actions` | `action_snapshot` | L98-L108 |
| `GET /ros/nodes` | `get_ros_nodes` | `node_snapshot` | L111-L121 |
| `GET /ros/alerts` | `get_ros_alerts` | `alerts` | L124-L127 |

`RosMonitor.alerts()`는 Topic, Service, Action, Node의 현재 상태를 각 Runtime에서
읽고 도메인별 Alert builder 결과를 하나의 배열과 meta로 합칩니다
(`ros_monitor.py` L156-L195). Alert의 세부 조건은 `07_alert_flow.md`에서 설명합니다.

자주 틀리는 이해는 REST 요청이 들어올 때마다 ROS2 Graph가 갱신된다고 보는
것입니다. REST는 가장 최근에 완료된 Runtime cache의 snapshot을 반환합니다.

## 7. 세 가지 주기는 서로 다르다

**polling(폴링)**은 정해진 간격마다 최신 상태를 다시 확인하는 방식입니다. 이
프로젝트에는 서로 목적이 다른 세 종류의 반복 주기가 있습니다.

- Backend `poll_interval_sec`은 ROS2 Graph를 관찰해 Runtime cache를 갱신하는
  주기입니다.
- Frontend의 1초·3초·5초는 REST endpoint를 호출해 최신 cache snapshot을 가져오는
  주기입니다.
- WebSocket의 1초는 Backend가 가벼운 요약 snapshot을 연결된 화면으로 보내는
  주기입니다.

이 세 주기는 같은 값도 아니고 서로를 실행시키지도 않습니다. 예를 들어 Frontend가
1초마다 요청하더라도 Backend Graph 갱신 사이에 요청이 두 번 들어오면 두 요청이
같은 cache 내용을 받을 수 있습니다.

WebSocket은 `main.py` L130-L147에서 연결을 처리하고 1초마다
`RosMonitor.websocket_snapshot()`을 호출합니다. `websocket_snapshot()`은 REST와
같은 Runtime cache를 읽지만 Topic 원본 메시지나 전체 REST 응답을 보내지 않고
count와 상태 meta, 현재 Alert를 가볍게 다시 조립합니다. payload 생성 위치는
`ros_monitor.py` L117-L146이고 실제 JSON 전송은 `websocket_manager.py` L26-L38입니다.

자주 틀리는 이해는 WebSocket이 REST와 별도의 ROS2 cache를 만들거나 raw Topic
메시지를 계속 전송한다고 보는 것입니다. 두 채널은 같은 Runtime cache를 바탕으로
하지만 서로 다른 목적과 응답 구조를 사용합니다.

## 8. 서버 종료 때 정리되는 것

FastAPI가 종료되면 lifespan의 `finally` 구간이 `ros_monitor.stop()`을 호출합니다.
`stop()`은 rclpy를 종료하고, spin thread가 끝나기를 최대 2초 기다린 뒤, ROS2 Node를
파괴합니다. 마지막으로 Node 참조와 thread 참조를 비우고 네 Runtime의 cache와
subscription/client 참조를 정리합니다.

관련 코드는 `main.py` L25-L28과 `ros_monitor.py` L75-L93입니다. 이 cache는 DB가
아니므로 서버가 다시 시작되면 이전 감시 상태가 복원되지 않고 새로 수집됩니다.

## 9. 전체 흐름 복습

```text
Uvicorn → main.py → FastAPI lifespan → RosMonitor.start()
  — main.py L15-L31, ros_monitor.py L59-L73
→ ROS2 Node와 timer 생성 → 최초 _update_graph()
  — ros_monitor.py L64-L70
→ spin thread의 rclpy.spin() → timer callback으로 반복 갱신
  — ros_monitor.py L72-L73, L292-L309
→ 네 Runtime cache → REST snapshot / WebSocket 요약
  — ros_monitor.py L95-L195, main.py L54-L147
→ lifespan 종료 → RosMonitor.stop()
  — main.py L25-L28, ros_monitor.py L75-L93
```

초보자가 마지막으로 확인할 부분은 다음 세 가지입니다.

- REST 요청은 ROS2 Graph를 직접 갱신하지 않고 완료된 cache snapshot을 읽습니다.
- FastAPI 웹 처리와 ROS2 spin은 같은 프로그램 안의 서로 다른 작업 흐름입니다.
- Backend Graph 갱신, Frontend REST polling, WebSocket 전송 주기는 서로 독립입니다.

## 내가 반드시 알아야 할 것 3줄 요약

1. lifespan은 서버 시작 때 `RosMonitor.start()`, 종료 때 `stop()`을 자동 실행합니다.
2. spin thread의 timer가 네 Runtime cache를 갱신하고 Lock이 동시 접근을 보호합니다.
3. REST와 WebSocket은 ROS2를 다시 조회하지 않고 같은 cache의 서로 다른 snapshot을 읽습니다.
