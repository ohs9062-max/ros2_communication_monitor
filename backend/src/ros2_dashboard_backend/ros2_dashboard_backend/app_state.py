"""Shared application singletons for FastAPI routers."""

from ros2_dashboard_backend.config_loader import load_backend_config
from ros2_dashboard_backend.ros_monitor import RosMonitor
from ros2_dashboard_backend.websocket_manager import WebSocketManager


backend_config = load_backend_config()
ros_monitor = RosMonitor(backend_config.monitor)
websocket_manager = WebSocketManager()
