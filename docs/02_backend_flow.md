# Backend 전체 흐름

## 무엇을 담당하는가

Backend는 하나의 FastAPI 프로세스 안에서 ROS2 Graph와 메시지를 관찰하고, 결과를 cache로 정리해 REST와 WebSocket으로 제공한다.

핵심 원칙은 API 요청마다 ROS2 Node를 만들거나 CLI를 실행하지 않는 것이다. `rclpy` Runtime이 계속 관찰하고 API는 준비된 snapshot을 읽는다.

## 파일별 책임

| 파일 | 책임 |
|---|---|
| `main.py` | FastAPI app, lifespan, middleware, router, `/health` |
| `app_state.py` | 설정과 `RosMonitor` singleton 생성 |
| `ros_monitor.py` | Runtime 조립, spin thread, 주기 갱신, 공통 snapshot과 Alert |
| `resource_state.py` | 발견 이력과 disconnected 상태 보조 |
| `routers/monitoring.py` | `/ros/*`, `/ws/monitor` 응답 |
| `topic/`, `service/`, `action/`, `node/` | 리소스별 Graph 조회와 상태 계산 |
| `interface_lab/` | 등록·Apply와 사용자 명시 실행 |

`main.py`에 도메인별 로직을 넣지 않고, router도 요청 파싱과 Runtime 호출에 집중한다.

## 시작 흐름

```text
Uvicorn worker 시작
→ FastAPI lifespan startup
→ app_state의 RosMonitor.start()
→ rclpy 초기화와 Monitor Node 생성
→ Topic/Service/Action/Node Runtime 생성
→ spin thread와 갱신 timer 시작
→ REST/WebSocket 제공
```

`--reload`를 사용하면 worker 교체 때 이 전체 생명주기가 다시 수행된다.

## 주기 갱신 흐름

`RosMonitor._update_graph()`가 각 Runtime을 갱신한다.

```text
ROS2 Graph API 조회
→ Runtime별 current item 계산
→ 이전 cache와 비교해 발견/종료 상태 계산
→ Topic callback이 latest와 timestamp window 갱신
→ Alert 후보 생성
→ active/resolved cache 정리
→ API용 snapshot 보관
```

ROS2 목록의 데이터 소스는 `rclpy` Graph API다. `ros2 topic list` 같은 CLI subprocess 결과를 Backend 기능에 사용하지 않는다.

## 읽기 흐름

REST endpoint는 필요한 영역의 상세 snapshot을 반환한다.

- `/ros/topics`: Topic 상태, 연결 수, 감시 가능 여부
- `/ros/topics/latest`, `/ros/topics/hz`: 선택 Topic 상세 값
- `/ros/services`, `/ros/actions`, `/ros/nodes`: 각 리소스 상태와 관계
- `/ros/alerts`: 현재 Alert와 최근 해결 이력

WebSocket은 전체 상세 데이터를 대체하지 않는다. 연결 상태와 가벼운 monitor snapshot을 빠르게 전달하고, 목록과 상세 화면은 REST polling을 사용한다. 자세한 구분은 [08_websocket_flow.md](08_websocket_flow.md)에 있다.

## Cache와 동시성

ROS callback, timer, FastAPI 요청은 서로 다른 실행 문맥에서 같은 데이터를 볼 수 있다. Runtime은 lock 안에서 cache를 변경하고 외부에는 복사된 snapshot을 반환한다.

이 구조가 필요한 이유는 다음과 같다.

- API 요청 중 cache가 반쯤 변경되는 것을 방지
- ROS callback이 HTTP 응답 때문에 오래 막히는 것을 방지
- Graph가 잠깐 사라졌을 때 이전 관계와 발견 이력을 비교

cache와 Alert history는 메모리 기반이다. Backend가 재시작되면 발견 이력, disconnected 상태, resolved Alert history가 초기화된다.

## 종료 흐름

```text
FastAPI lifespan shutdown
→ RosMonitor.stop()
→ timer와 Runtime cleanup
→ Subscription/Client 정리
→ spin 종료 및 thread join
→ Node destroy
→ rclpy shutdown
```

reload 중 연결이 끊기는 것은 worker 교체 구간에서는 예상할 수 있다. 재시작 뒤에도 복구되지 않으면 shutdown 순서, 새 `rclpy.init()`, Runtime startup 로그를 확인한다.

## Interface Lab과의 경계

Monitoring Runtime은 자동 관찰만 한다. Interface Lab의 Publish, Receive, Service Call, Action Goal은 별도 execution Runtime이 사용자의 요청을 받은 경우에만 실행한다. 자세한 흐름은 [12_interface_lab_flow.md](12_interface_lab_flow.md)에 있다.

## 문제가 생기면

1. `/health`가 성공하는지 확인
2. `RosMonitor.start()`와 `_update_graph()` 로그 확인
3. 특정 `/ros/*` 응답에서 Graph와 상태 필드 확인
4. Runtime cache와 lock 범위를 확인
5. reload 사용 중이면 worker PID가 바뀐 시각과 비교
