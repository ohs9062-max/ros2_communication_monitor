# ROS2 Communication Monitor Dashboard 실행환경 설정 가이드

## 1. 문서 목적

이 문서는 ROS2 Communication Monitor Dashboard를 처음 실행하는 사람이
개발 환경을 준비하고, Gazebo/Nav2 시뮬레이션과 backend/frontend를 같은 ROS2
환경에서 순서대로 실행할 수 있도록 정리한 가이드입니다.

처음 실행할 때는 아래 순서로 진행하면 됩니다.

1. ROS2 환경을 source 한다.
2. TurtleBot3/Gazebo와 Nav2를 실행한다.
3. backend Python venv를 준비하고 colcon build를 실행한다.
4. FastAPI backend를 실행한다.
5. React/Vite frontend를 실행한다.
6. API, WebSocket, 화면 데이터를 확인한다.

## 2. 전체 실행 구성

현재 코드 기준 실행 구성은 다음과 같습니다.

```text
TurtleBot3 + Gazebo / Nav2 / 실제 ROS2 장비
        ↓
ROS2 Graph, Topic, Service, Action, Node
        ↓
Python backend (FastAPI)
  - 모니터링 (Runtime Cache)
  - Interface Lab (등록/빌드/적용)
        ↓
React + Vite frontend (Browser)
```

backend는 ROS2에 직접 붙는 역할을 합니다. Interface Lab은 사용자가 등록한
인터페이스를 빌드하여 ROS2 환경에 적용합니다.

## 3. 권장 실행 환경

- Ubuntu 24.04
- ROS2 Jazzy
- Python 3.12 계열
- Node.js 20 이상
- npm 10 이상

## 4. ROS2 환경 준비 및 빌드 설정

ROS2 명령을 쓰는 모든 터미널에서 ROS2 환경을 source 해야 합니다.

```bash
source /opt/ros/jazzy/setup.bash
export ROS_DOMAIN_ID=0
```

### Backend 빌드 (Interface Lab 포함)
Interface Lab은 업로드된 인터페이스 파일들을 빌드해야 하므로,
`colcon`과 `ament_cmake` 환경이 venv와 함께 필요합니다.

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
source .venv/bin/activate

# 인터페이스 빌드를 위한 의존성 빌드
colcon build --symlink-install
source install/setup.bash
```

인터페이스 파일(.msg, .srv, .action)을 추가하거나 변경한 후에는 반드시 다시 빌드하고 `source install/setup.bash`를 수행해야 합니다.

## 5. Backend 실행

```bash
cd ~/rang/ros2_dashboard/backend
source .venv/bin/activate
source install/setup.bash

python3 -m uvicorn ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --reload
```

## 6. Frontend 실행

```bash
cd ~/rang/ros2_dashboard/frontend
npm run dev
```

## 7. 주요 확인 사항 및 문제 해결

- **ROS2 환경**: 모든 터미널에서 `source`와 `ROS_DOMAIN_ID` 설정을 확인하세요.
- **Interface Lab**: 인터페이스 추가/삭제 시 `backend` 폴더에서 `colcon build`를 실행해야 반영됩니다.
- **빌드 오류**: `ament_cmake` 관련 오류 발생 시 `/opt/ros/jazzy`가 제대로 source 되었는지 확인하세요.
- **포트 충돌**: 8000 포트가 이미 사용 중이라면 백엔드 포트를 변경하고 프론트엔드의 `VITE_API_BASE_URL`도 변경해야 합니다.

## 8. 실행 순서 요약

1. Gazebo 실행 (`ros2 launch ...`)
2. Nav2 실행 (`ros2 launch ...`)
3. Backend 실행 (`uvicorn ...`)
4. Frontend 실행 (`npm run dev`)
5. 브라우저에서 접속 확인

(상세한 명령은 이전 섹션의 명령어들을 참고하세요.)
