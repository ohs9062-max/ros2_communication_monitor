# 프로젝트 개요: ROS2 Communication Monitor Dashboard

이 프로젝트는 복잡한 ROS2 시스템에서 현재 어떤 데이터가 흐르고 있고, 어떤 서비스와 액션이 작동 중인지 한눈에 보기 위한 모니터링 대시보드입니다.

## 전체 데이터 흐름
`ROS2 시스템` → `Backend (Python/FastAPI)` → `REST API / WebSocket` → `Frontend (React)`

1. **ROS2 시스템**: 실제 로봇이나 시뮬레이션이 동작하며 토픽, 서비스, 액션을 발생시킵니다.
2. **Backend**: `rclpy`를 사용하여 ROS2 그래프(현재 상태)를 주기적으로 조회하고, 데이터를 가공하여 API 형태로 준비합니다.
3. **Frontend**: 브라우저에서 백엔드의 API를 호출하여 화면에 표시합니다.

## 기술 스택 선정 이유
- **FastAPI (Backend)**: 가볍고 빠르며, 비동기 처리에 강해 ROS2 모니터링 데이터를 실시간에 가깝게 제공하기 좋습니다.
- **rclpy (ROS2 Python Client)**: ROS2 시스템과 직접 통신하여 그래프 정보를 가져오기 위한 필수 라이브러리입니다.
- **React (Frontend)**: 컴포넌트 단위로 화면을 구성하여 복잡한 로봇 상태 데이터를 체계적으로 보여주기에 적합합니다.

## API & WebSocket 전략
- **REST API (Polling)**: 사용자가 특정 페이지에 진입하거나 데이터를 수동으로 갱신할 때 사용합니다. 정적인 상태 정보를 가져오기 좋습니다.
- **WebSocket (Push)**: 화면을 항상 최신 상태로 유지하기 위해 백엔드에서 주기적으로 가벼운 '스냅샷'을 프론트로 밀어줍니다. 실시간성이 필요한 상태 요약에 사용됩니다.

## 주요 폴더 역할
- `backend/`: 데이터를 수집하고 API를 제공하는 파이썬 코드
- `frontend/`: 화면을 구성하고 데이터를 보여주는 리액트 코드
- `config/`: 모니터링 설정(allowlist, 타임아웃 등) 관리

### 내가 반드시 알아야 할 3줄 요약
1. ROS2 상태 정보를 가져와서 브라우저에 보여주는 웹 기반 대시보드입니다.
2. Backend는 `rclpy`로 ROS2 정보를 긁어오고, FastAPI로 REST/WebSocket API를 제공합니다.
3. Frontend는 REST API로 상세 데이터를, WebSocket으로 실시간 상태 요약을 받아서 보여줍니다.
