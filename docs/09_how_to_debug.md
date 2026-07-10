# 디버깅 절차

화면에 데이터가 나오지 않거나 이상할 때 확인하는 순서입니다.

## 1. 백엔드/프론트 실행 확인
- **백엔드**: `backend/src/ros2_dashboard_backend/` 폴더에서 적절한 ROS2 실행 명령(보통 `ros2 run ...`)으로 실행 중인지 확인합니다.
- **프론트**: `frontend/` 폴더에서 `npm run dev` 등으로 실행 중인지 확인합니다.

## 2. API 데이터 확인 (가장 중요!)
브라우저의 개발자 도구(Network 탭) 또는 `curl`을 사용하여 API 응답을 확인합니다.
- `curl http://localhost:8000/ros/topics` (포트 번호는 실제 환경에 맞게)
- JSON 응답의 `data` 필드에 리스트가 잘 들어오는지 확인합니다.

## 3. 이상 현상별 디버깅 순서
1. **화면 전체가 안 뜸**: 백엔드 프로세스가 살아있는지 확인합니다.
2. **목록은 뜨는데 값이 이상함**: ROS2 CLI (`ros2 topic list` 등)에서 실제 값을 확인하고, API JSON 결과와 비교합니다.
3. **상태가 안 바뀜**: WebSocket 연결이 되어 있는지 확인합니다 (Network 탭에서 `ws` 연결 확인).

## 테스트용 환경
- `ros2 run demo_nodes_cpp talker`와 `listener`를 실행하여 토픽이 잘 잡히는지 테스트합니다.

---

### 내가 반드시 알아야 할 3줄 요약
1. 문제가 발생하면 가장 먼저 백엔드 API가 정상적인 JSON 데이터를 반환하는지 확인합니다 (`curl` 활용).
2. API 결과와 실제 ROS2 CLI 결과(`ros2 topic list` 등)를 비교하여 문제가 백엔드인지 ROS2 시스템인지 파악합니다.
3. 브라우저의 개발자 도구(Network)를 통해 WebSocket 연결과 API 호출 상태를 체크하세요.
