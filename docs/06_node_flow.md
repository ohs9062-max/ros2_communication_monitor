# Node 모니터링 흐름

Node 모니터링은 현재 로봇 시스템에 어떤 노드들이 살아있고, 서로 통신 중인지 확인합니다.

## 핵심 흐름
1. **목록 가져오기**: `ros2_dashboard_backend/node/runtime.py`에서 `rclpy`를 통해 현재 활성화된 노드 목록을 가져옵니다.
2. **구조**: `namespace`와 `node_name`을 조합하여 전체 이름(`full_name`)을 만듭니다.
3. **카운트**: 노드가 가지고 있는 Pub/Sub, Service Server/Client, Action Server/Client 수를 계산합니다.
4. **Stale 탐지**: 설정된 시간(`nodes_stale_timeout_sec`) 동안 노드로부터 업데이트 신호가 없으면 `stale` 상태로 간주하고 `node_stale` 경고를 발생시킵니다.
5. **참고**: `_ros2cli_daemon`은 ROS2 CLI 도구가 자동으로 생성하는 노드이므로 화면에 노출될 수 있습니다.

## 주요 API 필드 (`/ros/nodes`)
- `full_name`: 노드의 전체 이름
- `status`: 현재 상태 (`active`, `stale`)
- `publisher_count`, `subscriber_count` 등: 노드가 보유한 통신 요소 수

## 프론트 연결
- **Page**: `frontend/src/pages/NodesPage.jsx`
- **Table**: `frontend/src/components/NodeTable.jsx`
- **Detail**: `frontend/src/components/NodeDetailPanel.jsx`

---

### 내가 반드시 알아야 할 3줄 요약
1. 백엔드는 현재 활성화된 ROS2 노드 목록을 조회합니다.
2. 마지막 업데이트 시간을 기준으로 노드가 살아있는지 죽었는지(`stale`)를 판단합니다.
3. 노드가 가진 통신 요소(Pub/Sub, Service, Action)의 수를 통해 노드의 역할을 이해할 수 있습니다.
