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
Python backend
  - FastAPI
  - rclpy
  - WebSocket /ws/monitor
        ↓
React + Vite frontend
        ↓
브라우저 대시보드
```

backend는 ROS2에 직접 붙는 역할을 합니다. frontend는 ROS2에 직접 접근하지
않고, FastAPI REST API와 WebSocket을 통해 backend snapshot을 받아 표시합니다.

README 기준과 현재 코드 기준 차이:

- README는 실행 메모 형태로 backend/frontend/Gazebo/Nav2 명령만 짧게 적혀 있습니다.
- AGENTS.md에는 Electron 역할도 언급되어 있지만, 현재 `frontend/package.json`과
  파일 구조 기준으로는 React/Vite 브라우저 frontend만 확인됩니다.
- AGENTS.md에는 `backend/.env`가 기준처럼 적혀 있지만, 현재 실제 파일은
  `backend/src/ros2_dashboard_backend/.env`에 있습니다. 코드상으로는
  `backend/.env`와 `backend/src/ros2_dashboard_backend/.env`를 모두 찾습니다.
- `backend/package.xml`, `backend/setup.py`는 루트 바로 아래에 없고,
  실제 ROS2 Python package 파일은
  `backend/src/ros2_dashboard_backend/package.xml`,
  `backend/src/ros2_dashboard_backend/setup.py`입니다.

## 3. 권장 실행 환경

현재 로컬 확인 기준:

```bash
lsb_release -ds
python3 --version
node --version
npm --version
```

확인된 값:

```text
Ubuntu 24.04.3 LTS
Python 3.12.3
Node.js v20.20.2
npm 10.8.2
ROS2 Jazzy
```

권장 환경:

- Ubuntu 24.04
- ROS2 Jazzy
- Python 3.12 계열
- Node.js 20 이상
- npm 10 이상
- Chrome, Chromium, Firefox 같은 최신 브라우저

ROS2 배포판 확인:

```bash
source /opt/ros/jazzy/setup.bash
printenv ROS_DISTRO
```

정상이라면 `jazzy`가 출력됩니다.

## 4. 프로젝트 폴더 위치

이 문서는 프로젝트가 아래 위치에 있다고 가정합니다.

```bash
cd ~/rang/ros2_dashboard
pwd
```

기준 경로:

```text
~/rang/ros2_dashboard
```

중요 폴더:

```text
backend/
  ROS2 workspace, FastAPI backend, rclpy monitor

backend/src/ros2_dashboard_backend/
  ament_python backend package

backend/src/ros2_dashboard_interfaces/
  MonitorStatus, KeyValue custom message package

frontend/
  React + Vite dashboard

docs/
  발표와 코드 흐름 설명 문서
```

## 5. ROS2 환경 준비

ROS2 명령을 쓰는 모든 터미널에서 먼저 ROS2 환경을 source 해야 합니다.

```bash
source /opt/ros/jazzy/setup.bash
```

TurtleBot3 시뮬레이션을 사용할 때는 모델도 지정합니다.

```bash
export TURTLEBOT3_MODEL=burger
```

ROS_DOMAIN_ID는 여러 ROS2 시스템이 같은 네트워크에 있을 때 통신 그룹을
나누는 값입니다. Gazebo, Nav2, backend가 서로를 보려면 같은 값을 써야 합니다.

```bash
printenv ROS_DOMAIN_ID
export ROS_DOMAIN_ID=0
```

이미 다른 값으로 맞춰 쓰고 있다면 모든 터미널에서 같은 값을 유지하면 됩니다.

Jazzy에서 `ROS_LOCALHOST_ONLY` 관련 경고가 보이면 기존 환경변수를 확인합니다.

```bash
printenv ROS_LOCALHOST_ONLY
printenv ROS_AUTOMATIC_DISCOVERY_RANGE
```

단일 PC 시연에서는 localhost 범위 검색을 쓰는 환경도 가능합니다.
다만 환경마다 네트워크 설정이 다르므로, Gazebo/Nav2/backend를 같은 터미널
환경 규칙으로 맞추는 것이 중요합니다.

```bash
unset ROS_LOCALHOST_ONLY
export ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST
```

다른 터미널을 열면 `source /opt/ros/jazzy/setup.bash`와 필요한 export 값이
자동으로 이어지지 않습니다. 터미널 1에서 Gazebo를 source 했더라도 터미널 3의
backend는 별도로 source 해야 ROS2 Python package와 graph discovery가 동작합니다.

## 6. Backend Python venv 설정

backend는 ROS2 workspace이므로 `backend/`에서 작업합니다.

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
```

venv는 `--system-site-packages` 옵션으로 만드는 것을 권장합니다.
이 옵션이 있어야 ROS2가 시스템에 설치한 `rclpy`, `sensor_msgs`, `nav_msgs`,
`geometry_msgs`, `action_msgs` 같은 Python package를 venv 안에서도 import할 수 있습니다.

```bash
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt
```

현재 `backend/requirements.txt` 기준 Python dependency:

```text
fastapi
uvicorn[standard]
python-dotenv
PyYAML
```

주의:

- `rclpy`는 pip로 설치하지 않습니다.
- `rclpy`는 ROS2 Jazzy 설치와 `source /opt/ros/jazzy/setup.bash`를 통해 사용합니다.

## 7. Backend 빌드

처음 실행하거나 ROS2 package 구조가 바뀌면 colcon build를 실행합니다.

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
source .venv/bin/activate
colcon build --symlink-install
source install/setup.bash
```

다시 build가 필요한 경우:

- `backend/src/ros2_dashboard_backend/setup.py` 변경
- `backend/src/ros2_dashboard_backend/package.xml` 변경
- `backend/src/ros2_dashboard_interfaces/msg/*.msg` 변경
- 새 ROS2 package 추가
- console script entry point 변경
- install 공간에 반영되어야 하는 package 구조 변경

단순 Python 함수 내부 수정은 `--symlink-install` 상태에서 바로 반영되는 경우가 많지만,
발표 전에는 build와 `source install/setup.bash`를 다시 해두는 편이 안전합니다.

빌드는 반드시 `backend/`에서 실행합니다. 루트에 `build/`, `install/`, `log/`가
생기면 잘못된 위치에서 build한 것입니다.

## 8. Backend 실행

현재 frontend 기본 API 주소는 `frontend/src/api/rosApi.js` 기준
`http://127.0.0.1:8000`입니다. 따라서 backend 기본 실행 포트는 8000으로 맞춥니다.

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
source .venv/bin/activate
source install/setup.bash

python3 -m uvicorn ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --reload
```

포트 8000이 이미 사용 중이면 8010이나 8011처럼 다른 포트를 쓸 수 있습니다.

```bash
python3 -m uvicorn ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8010 \
  --reload
```

이 경우 frontend도 같은 backend 주소를 보도록 실행해야 합니다.

```bash
cd ~/rang/ros2_dashboard/frontend
VITE_API_BASE_URL=http://127.0.0.1:8010 npm run dev
```

현재 `.env` 파일에는 `API_HOST`, `API_PORT`가 있지만, 실제 `main.py`는 uvicorn
명령의 `--host`, `--port`로 실행 포트를 결정합니다. `.env`에서 현재 코드가 직접
읽는 값은 `CORS_ORIGINS`, `MONITOR_CONFIG_PATH`입니다.

## 9. Backend 확인 명령

backend가 8000에서 실행 중일 때:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/ros/topics
curl http://127.0.0.1:8000/ros/services
curl http://127.0.0.1:8000/ros/actions
curl http://127.0.0.1:8000/ros/nodes
curl http://127.0.0.1:8000/ros/alerts
```

JSON을 보기 좋게 확인하려면:

```bash
curl http://127.0.0.1:8000/ros/topics | python3 -m json.tool
```

WebSocket은 `curl`보다 브라우저 개발자 도구나 WebSocket 도구에서 확인하는 편이
좋습니다. 브라우저 Console 예:

```javascript
const ws = new WebSocket('ws://127.0.0.1:8000/ws/monitor')
ws.onmessage = (event) => console.log(JSON.parse(event.data))
```

정상 snapshot의 상위 구조:

```json
{
  "type": "monitor_snapshot",
  "timestamp": 0,
  "data": {
    "topics": {},
    "services": {},
    "actions": {},
    "nodes": {},
    "alerts": []
  }
}
```

## 10. Frontend 설정

frontend는 React + Vite입니다.

```bash
cd ~/rang/ros2_dashboard/frontend
npm install
npm run dev
```

기본 Vite 주소는 보통 다음 중 하나입니다.

```text
http://localhost:5173
http://127.0.0.1:5173
```

backend를 8000이 아닌 포트로 실행했다면 `VITE_API_BASE_URL`을 맞춰야 합니다.

```bash
cd ~/rang/ros2_dashboard/frontend
VITE_API_BASE_URL=http://127.0.0.1:8010 npm run dev
```

검증 명령:

```bash
cd ~/rang/ros2_dashboard/frontend
npm run lint
npm run build
```

현재 `frontend/package.json` 기준 주요 script:

```text
npm run dev
npm run build
npm run lint
npm run preview
```

## 11. Gazebo / TurtleBot3 실행

Gazebo 시뮬레이션을 실행합니다.

```bash
source /opt/ros/jazzy/setup.bash
export TURTLEBOT3_MODEL=burger

ros2 launch turtlebot3_gazebo \
  turtlebot3_world.launch.py
```

로컬 ROS2 환경에서 `turtlebot3_gazebo` package는 `/opt/ros/jazzy` 아래에 설치된
것으로 확인했습니다.

Gazebo가 켜져야 `/odom`, `/imu`, `/scan` 같은 센서/상태 Topic이 의미 있는
publisher와 메시지를 갖습니다. Gazebo 없이 backend만 켜면 ROS2 graph가 비어 있거나,
Topic은 보이더라도 Hz/latest 값이 기대와 다를 수 있습니다.

키보드 조작 테스트가 필요하면 별도 터미널에서 실행합니다.

```bash
source /opt/ros/jazzy/setup.bash
export TURTLEBOT3_MODEL=burger

ros2 run turtlebot3_teleop teleop_keyboard
```

## 12. Nav2 실행

Nav2를 실행합니다.

```bash
source /opt/ros/jazzy/setup.bash
export TURTLEBOT3_MODEL=burger

ros2 launch turtlebot3_navigation2 \
  navigation2.launch.py \
  use_sim_time:=True
```

로컬 ROS2 환경에서 `turtlebot3_navigation2` package는 `/opt/ros/jazzy` 아래에
설치된 것으로 확인했습니다. `navigation2.launch.py --show-args` 기준
`use_sim_time`, `map`, `params_file`, `slam`, `autostart`, `use_composition` 등의
launch argument가 있습니다.

주의:

```bash
use_sim_time:=True
```

처럼 입력해야 합니다.

```bash
use_sim_time:=True~
```

처럼 뒤에 `~`가 붙으면 boolean `True`가 아니라 문자열처럼 처리되어 Nav2 component
실패 원인이 될 수 있습니다.

Nav2 핵심 Node 확인:

```bash
source /opt/ros/jazzy/setup.bash
ros2 node list | grep -E \
  '/bt_navigator|/controller_server|/planner_server|/amcl|/map_server'
```

주요 Action 확인:

```bash
source /opt/ros/jazzy/setup.bash
ros2 action list -t | grep navigate_to_pose
```

## 13. Action Goal 테스트

대시보드는 Action Goal을 보내지 않습니다. Goal/cancel 버튼도 만들지 않는 정책입니다.
Action 화면의 Goal 상태, Feedback, Result 표시를 확인하려면 외부 ROS2 CLI에서
테스트 Goal을 보냅니다.

`ros2 action send_goal --help` 기준 Jazzy 옵션은 `--feedback` 또는 `-f`입니다.

```bash
source /opt/ros/jazzy/setup.bash

ros2 action send_goal \
  /navigate_to_pose \
  nav2_msgs/action/NavigateToPose \
  "{pose: {header: {frame_id: map}, pose: {position: {x: 1.0, y: 0.0, z: 0.0}, orientation: {w: 1.0}}}}" \
  --feedback
```

대시보드 Actions 화면에서 확인할 것:

- `/navigate_to_pose`가 Action 목록에 보이는지
- Goal 상태가 accepted, executing, succeeded, canceled, aborted 등으로 갱신되는지
- Feedback preview가 들어오는지
- Result 또는 result error가 상세 패널에서 기존 정책대로 보이는지

## 14. 실행 순서 요약

터미널 1: Gazebo

```bash
source /opt/ros/jazzy/setup.bash
export TURTLEBOT3_MODEL=burger
ros2 launch turtlebot3_gazebo \
  turtlebot3_world.launch.py
```

터미널 2: Nav2

```bash
source /opt/ros/jazzy/setup.bash
export TURTLEBOT3_MODEL=burger
ros2 launch turtlebot3_navigation2 \
  navigation2.launch.py \
  use_sim_time:=True
```

터미널 3: Backend

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
source .venv/bin/activate
source install/setup.bash

python3 -m uvicorn ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --reload
```

터미널 4: Frontend

```bash
cd ~/rang/ros2_dashboard/frontend
npm run dev
```

터미널 5: 테스트 명령

```bash
source /opt/ros/jazzy/setup.bash
ros2 node list
ros2 topic list -t
ros2 action list -t
curl http://127.0.0.1:8000/health
```

## 15. 자주 나는 오류와 원인

`use_sim_time` type error:

- 원인: `use_sim_time:=True~`처럼 잘못 입력했거나 boolean 값이 문자열로 들어감.
- 해결: `use_sim_time:=True`로 다시 실행.

backend 포트 충돌:

- 원인: 8000 포트를 다른 프로세스가 사용 중.
- 해결: `--port 8010`으로 실행하고 frontend도
  `VITE_API_BASE_URL=http://127.0.0.1:8010 npm run dev`로 실행.

frontend가 API를 못 찾음:

- 원인: backend 포트와 `VITE_API_BASE_URL` 불일치.
- 해결: `frontend/src/api/rosApi.js` 기본값은 `http://127.0.0.1:8000`임을 확인하고
  실제 backend 주소와 맞춤.

`rclpy import error`:

- 원인: ROS2 환경을 source하지 않았거나 venv를 `--system-site-packages` 없이 생성.
- 해결: `source /opt/ros/jazzy/setup.bash` 후 venv를 다시 만들거나 ROS2 package가
  보이는 환경에서 실행.

ROS2 node/topic이 안 보임:

- 원인: Gazebo/Nav2가 실행되지 않았거나 터미널마다 ROS_DOMAIN_ID가 다름.
- 해결: 모든 터미널에서 `printenv ROS_DOMAIN_ID`를 확인하고 같은 값으로 맞춤.

venv에서 ROS2 package를 못 찾음:

- 원인: 일반 venv를 사용해서 system site package가 차단됨.
- 해결: `python3 -m venv --system-site-packages .venv`로 다시 생성.

WebSocket 연결 안 됨:

- 원인: backend가 꺼져 있거나 frontend의 API base URL이 잘못됨.
- 해결: `/health` 확인 후 브라우저 Network 탭에서 `/ws/monitor` 연결 확인.

Hz가 안 나옴:

- 원인: 해당 Topic type이 deep monitoring 지원 대상이 아니거나 메시지가 아직 수신되지 않음.
- 해결: `/odom`, `/imu`, `/scan`, `/joint_states`처럼 지원 type Topic이 발행 중인지 확인.

Alert가 안 뜨거나 너무 많이 뜸:

- 원인: 현재 Alert 정책은 단순 상태 badge가 아니라 조치 가능성이 높은 문제 중심입니다.
- 해결: required stream topic(`/imu`, `/joint_states`, `/odom`, `/scan`) stale/missing,
  service active_check timeout/error/failed, action aborted/canceled/result error,
  node stale 기준을 확인.

`ros2 launch --show-args`가 log directory 오류를 냄:

- 원인: 제한된 환경에서 `~/.ros/log`에 쓰지 못함.
- 해결: 실행 확인용으로는 `ROS_LOG_DIR=/tmp/ros2_dashboard_logs`를 지정.

```bash
ROS_LOG_DIR=/tmp/ros2_dashboard_logs ros2 launch \
  turtlebot3_navigation2 navigation2.launch.py --show-args
```

## 16. 검증 체크리스트

Backend:

- `curl http://127.0.0.1:8000/health`가 성공하는가
- `/ros/topics` 응답에 `data`와 `meta`가 있는가
- `/ros/services` 응답에 `data.services`, `data.meta`가 있는가
- `/ros/actions` 응답에 `data.actions`, `data.meta`가 있는가
- `/ros/nodes` 응답에 `data.nodes`, `data.meta`가 있는가
- `/ros/alerts` 응답에 `data`, `meta`가 있는가

Frontend:

- 브라우저에서 Vite 주소에 접속되는가
- Overview, Topics, Services, Actions, Nodes, Visualization, Alerts 화면이 열리는가
- 브라우저 뒤로가기/앞으로가기가 앱 내부 화면 이동으로 동작하는가
- 새로고침해도 현재 URL 화면이 유지되는가

WebSocket:

- `/ws/monitor`가 연결되는가
- 수신 메시지의 `type`이 `monitor_snapshot`인가
- raw topic message가 아니라 count 중심 summary snapshot인가

ROS2/Nav2:

- `/cmd_vel`, `/odom`, `/imu`, `/scan`, `/joint_states`가 확인되는가
- `/bt_navigator`, `/controller_server`, `/planner_server`, `/amcl`, `/map_server`가 확인되는가
- `/navigate_to_pose` Action이 확인되는가
- Visualization에서 주요 Node가 기본 노드 중심 목록에 보이는가
- Alerts가 단순 상태 정보가 아니라 실제 이상 상태 중심으로 표시되는가

## 17. 발표 전 실행 체크리스트

- 브라우저 강력 새로고침을 한다.
- backend 포트가 8000인지, 아니면 frontend `VITE_API_BASE_URL`과 맞는지 확인한다.
- frontend Vite 포트가 열려 있는지 확인한다.
- Gazebo가 실제로 실행 중인지 확인한다.
- Nav2가 active 상태인지 확인한다.
- `/cmd_vel`, `/odom`, `/imu`, `/scan` Topic을 확인한다.
- `/navigate_to_pose` Action을 확인한다.
- Action Goal 테스트를 한 번 보내 Actions 화면에 Goal/Feedback/Result가 보이는지 확인한다.
- 브라우저 뒤로가기/라우팅이 자연스럽게 동작하는지 확인한다.
- Visualization의 전체 Graph는 고급 확인용이며 복잡할 수 있다는 설명을 준비한다.

## 18. 복붙용 전체 실행 명령 모음

터미널 1: Gazebo

```bash
source /opt/ros/jazzy/setup.bash
export TURTLEBOT3_MODEL=burger
export ROS_DOMAIN_ID=0

ros2 launch turtlebot3_gazebo \
  turtlebot3_world.launch.py
```

터미널 2: Nav2

```bash
source /opt/ros/jazzy/setup.bash
export TURTLEBOT3_MODEL=burger
export ROS_DOMAIN_ID=0

ros2 launch turtlebot3_navigation2 \
  navigation2.launch.py \
  use_sim_time:=True
```

터미널 3: backend 최초 준비

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
export ROS_DOMAIN_ID=0

python3 -m venv --system-site-packages .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

colcon build --symlink-install
source install/setup.bash
```

터미널 3: backend 실행

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
export ROS_DOMAIN_ID=0
source .venv/bin/activate
source install/setup.bash

python3 -m uvicorn ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --reload
```

터미널 4: frontend 최초 준비

```bash
cd ~/rang/ros2_dashboard/frontend
npm install
```

터미널 4: frontend 실행

```bash
cd ~/rang/ros2_dashboard/frontend
npm run dev
```

backend를 8010에서 실행할 때 frontend 실행:

```bash
cd ~/rang/ros2_dashboard/frontend
VITE_API_BASE_URL=http://127.0.0.1:8010 npm run dev
```

터미널 5: API 확인

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/ros/topics | python3 -m json.tool
curl http://127.0.0.1:8000/ros/services | python3 -m json.tool
curl http://127.0.0.1:8000/ros/actions | python3 -m json.tool
curl http://127.0.0.1:8000/ros/nodes | python3 -m json.tool
curl http://127.0.0.1:8000/ros/alerts | python3 -m json.tool
```

터미널 5: ROS2 graph 확인

```bash
source /opt/ros/jazzy/setup.bash
export ROS_DOMAIN_ID=0

ros2 node list
ros2 topic list -t
ros2 service list -t
ros2 action list -t
```

터미널 5: Nav2 Action Goal 테스트

```bash
source /opt/ros/jazzy/setup.bash
export ROS_DOMAIN_ID=0

ros2 action send_goal \
  /navigate_to_pose \
  nav2_msgs/action/NavigateToPose \
  "{pose: {header: {frame_id: map}, pose: {position: {x: 1.0, y: 0.0, z: 0.0}, orientation: {w: 1.0}}}}" \
  --feedback
```

터미널 6: 검증

```bash
cd ~/rang/ros2_dashboard/backend
source /opt/ros/jazzy/setup.bash
source .venv/bin/activate
python3 -m compileall -q \
  src/ros2_dashboard_backend/ros2_dashboard_backend

cd ~/rang/ros2_dashboard/frontend
npm run lint
npm run build
```
