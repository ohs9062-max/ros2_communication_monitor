# 핵심 개념

이 프로젝트를 이해하기 위해 꼭 알아야 할 핵심 개념들입니다.

---

### ROS2 관련 개념

**개념: ROS2 Node**
- **쉬운 설명**: ROS2 시스템에서 각 기능을 수행하는 최소 단위의 프로그램입니다.
- **이 프로젝트에서 왜 쓰는지**: 시스템 전체에 노드가 몇 개 있는지, 정상인지 파악해야 하므로 가장 기본입니다.
- **관련 파일**: `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/`
- **화면에서는 어디에 보이는지**: NodesPage, NodeTable

**개념: Topic**
- **쉬운 설명**: 노드들끼리 데이터를 주고받는 통로(채널)입니다.
- **이 프로젝트에서 왜 쓰는지**: 어떤 데이터가 흐르고 있는지 모니터링하기 위함입니다.
- **관련 파일**: `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/topic/`
- **화면에서는 어디에 보이는지**: TopicsPage, TopicTable

**개념: Service**
- **쉬운 설명**: 클라이언트가 서버에 요청(Request)을 보내고 응답(Response)을 받는 통신 방식입니다.
- **이 프로젝트에서 왜 쓰는지**: 특정 기능을 실행하거나 상태를 확인하기 위해 사용되는 서비스들을 추적합니다.
- **관련 파일**: `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/service/`
- **화면에서는 어디에 보이는지**: ServicesPage, ServiceTable

**개념: Action**
- **쉬운 설명**: 시간이 오래 걸리는 작업을 위한 통신입니다.
  목표(Goal), 진행 상황(Feedback), 결과(Result)로 구성됩니다.
- **이 프로젝트에서 왜 쓰는지**: 로봇의 이동, 작업 등 긴 시간이 필요한 동작을 모니터링하기 위해 사용합니다.
- **관련 파일**: `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/action/`
- **화면에서는 어디에 보이는지**: ActionsPage, ActionTable

---

### 시스템/기술 개념

**개념: Snapshot**
- **쉬운 설명**: 특정 시점의 전체 시스템 상태를 사진 찍듯이 기록한 데이터입니다.
- **이 프로젝트에서 왜 쓰는지**: 계속 변하는 ROS2 Graph를 일정한 주기로
  cache에 반영하여 API로 제공하기 위해 사용합니다.
- **관련 파일**: `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/ros_monitor.py`

**개념: Stale**
- **쉬운 설명**: 데이터가 마지막으로 업데이트된 지 너무 오래되어 '신선하지 않은(구식)' 상태입니다.
- **이 프로젝트에서 왜 쓰는지**: 로봇 노드가 죽었거나 통신이 끊겼음을 감지하기 위해 사용합니다.
- **관련 파일**: `backend/src/ros2_dashboard_backend/ros2_dashboard_backend/node/discovery.py`

---

### 내가 반드시 알아야 할 3줄 요약
1. ROS2의 4대 요소인 Node, Topic, Service, Action을 모니터링합니다.
2. `Snapshot`은 특정 시점의 시스템 상태를 기록한 데이터입니다.
3. `Stale`은 데이터가 너무 오래되어 통신 문제 가능성을 알려주는 상태입니다.
