# Backend 전체 흐름 라인 추적

## 0. 이 문서를 보는 방법

- 이 문서는 코드 수정용이 아니라 이해용입니다.
- 각 설명은 실제 파일 경로와 라인 번호를 기준으로 합니다.
- FastAPI 서버의 시작부터 ROS2 데이터를 모니터링하고 웹으로 제공하기까지의 흐름을 라인 단위로 추적합니다.

## 1. FastAPI 서버 시작 흐름

| 순서 | 파일:라인 | 코드/함수 | 하는 일 | 의미 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `main.py:L14` | `backend_config = ...` | 설정 로드 | 실행에 필요한 환경 설정 로드 |
| 2 | `main.py:L15` | `ros_monitor = ...` | 모니터 객체 생성 | ROS2 데이터를 수집할 모니터 객체 준비 |
| 3 | `main.py:L16` | `websocket_manager = ...` | WebSocket 관리자 생성 | 프론트와 실시간 통신 관리 |
| 4 | `main.py:L19-L26` | `@asynccontextmanager lifespan` | 수명 주기 관리 | 서버 시작/종료 시 모니터 시작/중지 |
| 5 | `main.py:L29` | `app = FastAPI(...)` | FastAPI 앱 생성 | 웹 서버 앱 정의 |

## 2. RosMonitor 클래스 초기화 흐름

| 필드/객체 | 파일:라인 | 초기화 위치 | 역할 | 나중에 어디서 사용되는지 |
| :--- | :--- | :--- | :--- | :--- |
| `self._topic_runtime` | `ros_monitor.py` | `__init__` | 토픽 graph/subscription/Hz | `_update_graph`에서 호출 |
| `self._action_runtime` | `ros_monitor.py` | `__init__` | 액션 graph/status/feedback/result | `_update_graph`에서 호출 |
| `self._service_runtime` | `ros_monitor.py` | `__init__` | 서비스 graph/count/active-check | `_update_graph`에서 호출 |
| `self._node_runtime` | `ros_monitor.py:L70` | `__init__` | 노드 상태 수집 | `_update_graph`에서 호출 |

## 3. start() 메서드 흐름

### 3.1 rclpy.init()
- 파일:라인: `ros_monitor.py:L100`
- 코드: `rclpy.init(args=None)`
- 역할: ROS2 시스템 초기화
- 의미: 백엔드 노드가 ROS2 통신에 참여할 준비를 마침.

### 3.2 ROS2 Node 생성
- 파일:라인: `ros_monitor.py:L101`
- 코드: `self._node = Node('ros2_dashboard_topic_monitor')`
- 역할: 모니터링 노드 생성
- 의미: `ros2_dashboard_topic_monitor`라는 이름의 노드가 생성되어 그래프 정보를 읽음.

### 3.3 create_timer
- 파일:라인: `ros_monitor.py:L102-L105`
- 코드: `self._node.create_timer(..., self._update_graph)`
- 역할: 주기적 실행 타이머 설정
- 의미: 설정된 간격마다 `_update_graph`를 호출하여 그래프 갱신.

### 3.4 rclpy.spin thread
- 파일:라인: `ros_monitor.py:L108-L109`
- 코드: `self._thread = Thread(target=self._spin, daemon=True)`
- 역할: 별도 스레드에서 spin 실행
- 의미: FastAPI와 독립적으로 ROS2 이벤트를 처리하기 위해 별도 스레드 사용.

## 4. _update_graph 주기 흐름

| 호출 순서 | 파일:라인 | 호출 함수 | 갱신하는 데이터 | 다음 연결 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `ros_monitor.py:L356` | `_node_runtime.update()` | 노드 목록, 상태 | `node_snapshot` |
| 2 | `ros_monitor.py:L357` | `_topic_runtime.update()` | 토픽 목록, 카운트 | `snapshot` |
| 3 | `ros_monitor.py:L358` | `_service_runtime.update()` | 서비스 목록 | `service_snapshot` |
| 4 | `ros_monitor.py:L359` | `_action_runtime.update()` | 액션 목록과 runtime | `action_snapshot` |

## 5. Topic update 상세 흐름

ROS2 Graph (`topic/runtime.py`)
→ `TopicRuntime.update()`
→ `node.get_topic_names_and_types()`
→ `build_topic_item()`
→ `TopicRuntime` cache
→ `RosMonitor.snapshot()`
→ `main.py`의 `/ros/topics` endpoint (`main.py:L50`)

## 6. Service update 상세 흐름

`ServiceRuntime.update()` (`service/runtime.py`)에서 수행합니다.
**안전 설계**: Service Graph 조회와 allowlist 기반 active check는 분리되어 있으며,
실제 요청은 `ServiceActiveCheckRuntime`이 허용된 대상에만 수행합니다.

## 7. Action update 상세 흐름

`ActionRuntime.update()` (`action/runtime.py`)에서 수행합니다.
**"관찰된 Goal만 조회"**: ActionRuntime 내부의 `ActionResultRuntime`이
이미 관찰된 terminal Goal에 대해서만 결과를 조회합니다.

## 9. REST API endpoint 흐름

| API | 파일:라인 | 호출하는 monitor 메서드 | 반환 데이터 |
| :--- | :--- | :--- | :--- |
| `/ros/topics` | `main.py:L51` | `ros_monitor.snapshot()` | 토픽 리스트 |
| `/ros/services`| `main.py:L82` | `ros_monitor.service_snapshot()` | 서비스 리스트 |
| `/ros/actions` | `main.py:L97` | `ros_monitor.action_snapshot()` | 액션 리스트 |

## 10. WebSocket 흐름

Frontend WebSocket 연결 → `main.py:L116` (`@app.websocket`) → `websocket_manager.connect()` → `ros_monitor.websocket_snapshot()` (`ros_monitor.py:L157`) → `websocket.send_json()` → 프론트 화면 갱신

## 12. 설정 파일 monitor.yaml 흐름

| 설정 key | monitor.yaml 라인 | 읽는 코드 파일:라인 | 사용 위치 |
| :--- | :--- | :--- | :--- |
| `poll_interval_sec` | (예시) | `ros_monitor.py:L102` | `_node.create_timer` |
| `nodes_stale_timeout_sec` | (예시) | `ros_monitor.py:L68` | `NodeRuntime` |

## 13. 백엔드 실행 시 실제 순서

1. `source .venv/bin/activate`: 파이썬 가상환경 활성화 (필요한 라이브러리 사용).
2. `source install/setup.bash`: ROS2 패키지 환경변수 설정.
3. `python3 -m uvicorn ros2_dashboard_backend.main:app ...`:
   - `uvicorn`이 `ros2_dashboard_backend.main` 모듈의 `app` 객체를 찾아 실행.
   - FastAPI 앱이 로드되면서 `main.py` 파일 실행.
   - `lifespan`의 `ros_monitor.start()`가 호출되어 ROS2 모니터링 시작.

## 14. 내가 헷갈리기 쉬운 포인트

- FastAPI 서버와 ROS2 Node는 별도의 실행 주체입니다.
- `rclpy.spin()`이 도는 스레드가 ROS2 통신을 책임집니다.
- WebSocket은 주기적으로 데이터 요약(snapshot)을 밀어주는 역할을 합니다.

## 15. 읽는 순서 추천

1. `main.py:L1-L30`: FastAPI 서버 시작 및 모니터 초기화
2. `ros_monitor.py:L58-L85`: RosMonitor 초기화 (`__init__`)
3. `ros_monitor.py:L98-L109`: `start()` 메서드 (노드 생성 및 스레드 시작)
4. `ros_monitor.py:L354-L361`: `_update_graph()` (주기적 갱신 루프)
5. `main.py:L50-L60`: `/ros/topics` API 처리

## 16. 내가 반드시 알아야 할 3줄 요약

1. FastAPI `lifespan`에서 `ros_monitor.start()`가 호출되어 백그라운드 스레드에서 ROS2 Node가 spin 됩니다.
2. `_update_graph`가 주기적으로 호출되어 노드, 토픽, 서비스, 액션 데이터를 내부 캐시에 최신화합니다.
3. API 요청이 들어오면 내부 캐시(`snapshot`)의 데이터를 즉시 반환하며, WebSocket은 1초마다 이 캐시를 요약해서 전송합니다.
