"""ROS2 Dashboard Backend의 app_state 관련 기능을 담당하는 모듈입니다."""

from ros2_dashboard_backend.config_loader import load_backend_config
from ros2_dashboard_backend.ros_monitor import RosMonitor
from ros2_dashboard_backend.websocket_manager import WebSocketManager


backend_config = load_backend_config()
ros_monitor = RosMonitor(backend_config.monitor)
websocket_manager = WebSocketManager()
