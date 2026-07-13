# Backend 전체 흐름

이 프로젝트의 백엔드는 ROS2의 데이터를 실시간으로 가져와 웹으로 제공하는 FastAPI 서버입니다.

## 1. 서버 시작 흐름
1. `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/main.py` 파일이 실행됩니다.
2. `FastAPI()` 앱이 초기화됩니다.
3. `@asynccontextmanager lifespan`을 통해 서버 시작 시 `ros_monitor.start()`가 호출됩니다.

## 2. ROS2 monitor node 생성 흐름
1. `RosMonitor` 클래스 (`ros_monitor.py`)가 초기화될 때 설정(`monitor.yaml`)을 로드합니다.
2. `start()` 메서드에서 `rclpy.init()`을 호출하고 `ros2_dashboard_topic_monitor`라는 이름의 노드를 생성합니다.
3. `create_timer`를 사용하여 주기적으로 `_update_graph` 메서드를 호출합니다.
4. 별도의 스레드(`Thread`)에서 `rclpy.spin()`을 호출하여 ROS2 이벤트를 계속 처리합니다.

## 3. 주기적 graph update 흐름
`_update_graph` (`ros_monitor.py`)는 매 주기마다 다음을 수행합니다:
1. `_node_runtime.update()`: 노드 상태 업데이트
2. `_topic_runtime.update()`: 토픽 목록, subscription, Hz 갱신
3. `_service_runtime.update()`: 서비스 목록과 active-check cache 갱신
4. `_action_runtime.update()`: 액션 목록, status/feedback/result 갱신
5. `_service_runtime.update_active_checks()`: allowlist 서비스 응답 검사

## 4. REST API 요청 처리 흐름
- `main.py`의 엔드포인트(`@app.get('/ros/topics')` 등)가 호출됩니다.
- `ros_monitor.snapshot()` 메서드 등을 통해 내부적으로 가지고 있는 최신 데이터를 반환합니다.

## 5. WebSocket 전송 흐름
- `main.py`의 `/ws/monitor` 엔드포인트가 연결되면, `websocket_manager`를 통해 `ros_monitor.websocket_snapshot()` 데이터를 1초 간격으로 보냅니다.

## 6. Alert 생성/병합 흐름
- `ros_monitor.alerts()` 메서드는 Topic, Service, Action, Node의 모든 모니터링 정보를 합쳐서 `build_alerts()` 계열 함수들을 호출해 경고 메시지를 생성합니다.

---

### 내가 반드시 알아야 할 3줄 요약
1. 백엔드는 FastAPI와 `rclpy`를 사용하여 ROS2 그래프 상태를 실시간으로 모니터링합니다.
2. `RosMonitor`가 노드를 생성하고 스레드에서 주기적으로 그래프를 스캔합니다.
3. REST API는 상태 조회, WebSocket은 주기적인 상태 전송(스냅샷)을 담당합니다.
