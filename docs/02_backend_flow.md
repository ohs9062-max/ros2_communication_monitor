# Backend 전체 흐름

> 라인 번호는 2026-07-13 문서 작성 시점의 현재 코드 기준이다.

## 1. 이 문서에서 설명하는 범위

FastAPI 모듈 로드부터 `RosMonitor` 시작, 주기적 ROS2 Graph 갱신,
REST/WebSocket snapshot 반환, 종료 정리까지 설명한다.

## 2. 한 줄 요약

`main.py`가 FastAPI 수명 주기에 `RosMonitor`를 연결하고,
`RosMonitor`가 네 도메인 Runtime의 캐시를 갱신한 뒤 API에 제공한다.

## 3. 전체 흐름

```text
Uvicorn import main.py
→ 설정/RosMonitor/WebSocketManager 생성
→ FastAPI lifespan 진입
→ RosMonitor.start()
→ rclpy Node + timer + spin thread
→ Runtime cache 주기 갱신
→ REST endpoint 또는 monitor_snapshot 반환
→ lifespan 종료 시 RosMonitor.stop()
```

## 4. 시작과 종료 코드 위치

| 단계 | 설명 | 파일 | 라인 | 함수/클래스 |
|---|---|---|---|---|
| 1 | 설정과 coordinator 생성 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` | L15-L18 | 모듈 초기화 |
| 2 | FastAPI 수명 주기 연결 | 같은 파일 | L21-L31 | `lifespan`, `FastAPI` |
| 3 | Runtime 네 개 조립 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` | L23-L57 | `RosMonitor.__init__` |
| 4 | rclpy 초기화와 Node 생성 | 같은 파일 | L59-L70 | `RosMonitor.start` |
| 5 | spin thread 시작 | 같은 파일 | L72-L73 | `RosMonitor.start` |
| 6 | ROS2 callback 처리 | 같은 파일 | L292-L302 | `RosMonitor._spin` |
| 7 | shutdown, Node 파괴, cache 정리 | 같은 파일 | L75-L93 | `RosMonitor.stop` |

`RosMonitor.__init__`은 설정을 직접 다시 읽지 않는다. `main.py` L16에서
로드한 `backend_config.monitor`를 L17에서 생성자에 전달한다.

## 5. 전체 Graph update 순서

`RosMonitor.start`는 `poll_interval_sec` 간격 timer를 만들고 즉시 한 번
`_update_graph`를 호출한다(`ros_monitor.py` L66-L70).

| 순서 | 설명 | 파일 | 라인 | 함수/클래스 |
|---|---|---|---|---|
| 1 | Node 관계와 stale cache 갱신 | `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py` | L304-L305 | `RosMonitor._update_graph` |
| 2 | Topic graph/subscription 갱신 | 같은 파일 | L304-L306 | `RosMonitor._update_graph` |
| 3 | Service graph 갱신 | 같은 파일 | L304-L307 | `RosMonitor._update_graph` |
| 4 | Action graph/event/result 갱신 | 같은 파일 | L304-L308 | `RosMonitor._update_graph` |
| 5 | allowlist Service active check 진행 | 같은 파일 | L304-L309 | `RosMonitor._update_graph` |

순서상 Node가 먼저 갱신되고, Service active check는 그 주기에 만든
`services` 목록을 받아 마지막에 진행된다. active check 결과는 cache에
기록되고 다음 Service graph 조립에서 public item에 병합된다.

## 6. Runtime 책임

| Runtime | 생성 위치 | 주 책임 |
|---|---|---|
| `TopicRuntime` | `ros_monitor.py` L37-L44 | Topic graph, 구독, latest, Hz cache |
| `ServiceRuntime` | `ros_monitor.py` L53-L57 | Service graph, 분류, count, active-check 조립 |
| `ActionRuntime` | `ros_monitor.py` L32-L36 | Action graph, status/feedback, result runtime |
| `NodeRuntime` | `ros_monitor.py` L45-L52 | Node별 관계, count, stale 보존 |

네 Runtime은 같은 `Lock`과 `node_getter=lambda: self._node`를 전달받는다.
FastAPI endpoint가 ROS2 Graph를 직접 읽지 않고 cache snapshot만 읽는 이유다.

## 7. REST 흐름

| API | endpoint | monitor 위임 | 라인 |
|---|---|---|---|
| `GET /ros/topics` | `get_ros_topics` | `snapshot` | `main.py` L54-L66 |
| `GET /ros/topics/latest` | `get_latest_ros_topic` | `latest_message` | L69-L72 |
| `GET /ros/topics/hz` | `get_ros_topic_hz` | `topic_hz` | L75-L78 |
| `GET /ros/services` | `get_ros_services` | `service_snapshot` | L81-L95 |
| `GET /ros/actions` | `get_ros_actions` | `action_snapshot` | L98-L108 |
| `GET /ros/nodes` | `get_ros_nodes` | `node_snapshot` | L111-L121 |
| `GET /ros/alerts` | `get_ros_alerts` | `alerts` | L124-L127 |

## 8. WebSocket 흐름

`main.py` L130-L147이 연결을 받고 1초마다
`RosMonitor.websocket_snapshot()`을 보낸다. payload 생성은
`ros_monitor.py` L117-L146, 실제 전송은 `websocket_manager.py` L26-L38이다.
WebSocket은 원본 메시지 stream이 아니라 REST cache의 요약 채널이다.

## 9. Alert 통합

`RosMonitor.alerts`(`ros_monitor.py` L156-L195)는 각 Runtime snapshot을
가져와 Topic, Service, Action, Node builder를 차례로 호출하고,
`build_alert_meta`로 공통 count를 만든다. 상세 정책은
`07_alert_flow.md`에서 다룬다.

## 10. 발표 때 설명할 문장

“FastAPI endpoint가 ROS2를 매번 조회하는 구조가 아니라, 별도 rclpy Node가
주기적으로 만든 thread-safe cache를 REST와 WebSocket이 읽는 구조입니다.”

## 11. 헷갈리기 쉬운 부분

- coordinator 클래스는 현재 `RosMonitor`다.
- ROS2 Graph에 보이는 Node 이름 `/ros2_dashboard_topic_monitor`는 호환을 위해
  유지된 실행 이름이며 coordinator 클래스명과 다르다.
- `rclpy.spin()`은 timer와 subscription callback을 처리하는 background thread다.
- WebSocket 1초 주기와 Graph `poll_interval_sec`은 서로 다른 설정이다.

## 12. 관련 파일 빠른 참조

- `backend/.../main.py`: FastAPI 수명 주기와 endpoint
- `backend/.../ros_monitor.py`: coordinator와 public snapshot
- `backend/.../websocket_manager.py`: 연결/전송 관리
- `backend/config/monitor.yaml` L1-L4: poll/stale/Hz 시간 설정
