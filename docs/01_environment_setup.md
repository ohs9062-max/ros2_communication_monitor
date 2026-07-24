# 실행 환경과 개발 시작

## 필요한 환경

현재 기준 환경은 Ubuntu 24.04, ROS2 Jazzy, Python 3, Node.js 20 이상이다. Backend는 FastAPI와 `rclpy`, Frontend는 Vite와 React를 사용한다.

프로젝트 구조에서 ROS2 workspace는 저장소 루트가 아니라 `backend/`다.

```text
ros2_dashboard/
├─ backend/   ← colcon build 위치
└─ frontend/  ← npm 실행 위치
```

## Backend 준비

새 터미널에서 ROS2 환경을 먼저 불러온다.

```bash
cd backend
source /opt/ros/jazzy/setup.bash
```

가상환경을 새로 만든다면 시스템에 설치된 `rclpy`를 볼 수 있도록 구성한다.

```bash
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

빌드와 overlay 적용 순서는 다음과 같다.

```bash
colcon build --symlink-install
source install/setup.bash
```

`--symlink-install`은 Python 소스 변경을 install 공간에 복사하는 대신 symlink로 연결해 개발 중 반복 빌드 비용을 줄인다. 새 Interface 생성처럼 ROS code generation이 필요한 변경은 다시 build해야 한다.

## Backend 실행

안정적으로 상태를 관찰하려면 reload 없이 실행한다.

```bash
python3 -m uvicorn \
  ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8000
```

Python 개발 중 자동 반영이 필요하면 `--reload`를 사용할 수 있다.

```bash
python3 -m uvicorn \
  ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --reload
```

주의할 점은 FastAPI lifespan 안에서 ROS2 Runtime도 시작된다는 것이다. reload가 일어나면 WebSocket뿐 아니라 `rclpy`, Node, spin thread, Subscription도 함께 종료됐다가 다시 생성된다. Interface Apply 성공 후 `reload_trigger.py`가 갱신되면 reload가 발생할 수 있다. 연결 안정성을 조사할 때는 먼저 `--reload`를 빼고 비교한다.

## Frontend 실행

다른 터미널에서 실행한다.

```bash
cd frontend
npm install
npm run dev
```

현재 Frontend는 Vite 개발 서버가 제공하는 React 웹앱이다. Electron 명령은 필요하지 않다.

Backend 주소를 바꿔야 하면 Frontend 환경 변수의 API base URL을 실제 Backend 주소에 맞춘다.

## 기본 확인

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/ros/topics
curl http://127.0.0.1:8000/ros/services
curl http://127.0.0.1:8000/ros/actions
curl http://127.0.0.1:8000/ros/nodes
curl http://127.0.0.1:8000/ros/alerts
```

`/health`만 성공하고 리소스가 비어 있다면 다음 순서로 확인한다.

1. Backend 터미널에서 `/opt/ros/jazzy/setup.bash`와 `install/setup.bash`를 source했는가
2. 대상 ROS2 프로세스와 같은 `ROS_DOMAIN_ID`를 사용하는가
3. 등록 custom Interface가 현재 Python 환경에서 import 가능한가
4. `backend/config/interface_registry.yaml` 또는 `interface_packages.yaml`의 `import_available`이 최신인가
5. 실제 Graph 타입과 등록 `full_type`이 정확히 같은가

## 개발 변경별 반영 방법

| 변경 | 필요한 작업 |
|---|---|
| Backend Python 소스 | symlink build 상태라면 프로세스 재시작 또는 reload |
| Frontend JSX/CSS | Vite HMR로 자동 반영 |
| `monitor.yaml` | Backend 재시작 권장 |
| `.msg/.srv/.action` 정의 | Interface Apply 또는 `colcon build --symlink-install`, overlay 재-source |
| 업로드 package | Apply 후 import 결과 확인 |

`backend/build/`, `backend/install/`, `backend/log/`, `frontend/node_modules/`는 생성물이다. 문제 해결을 이유로 내용을 직접 고치지 않는다.

## 문제가 생기면

- Backend 시작 실패: lifespan 로그에서 `rclpy.init()`과 Runtime 시작 위치 확인
- import 실패: Apply status, build log, overlay source 순서 확인
- 화면만 연결 끊김: `/health` 연속 성공 여부와 브라우저 Network 확인
- reload 때만 끊김: worker PID 변경과 shutdown/startup 로그 확인
- Hz 미지원: `/ros/topics`의 `supported_type`, `deep_monitoring`, 실제 `type` 확인

기능별 추적 위치는 [11_code_trace_index.md](11_code_trace_index.md)를 참고한다.
