#!/usr/bin/env python3

import rclpy
from rclpy.node import Node

from demo_interface_imports import import_demo_interface

RobotControl = import_demo_interface(
    "srv",
    "RobotControl",
    [
        "rths_interfaces",
        "ros2_dashboard_interfaces",
        "uploaded_interfaces",
        "uploaded_interfaces_package",
    ],
)


class DemoRobotControlService(Node):
    def __init__(self):
        super().__init__("demo_robot_control_service")

        self._service = self.create_service(
            RobotControl,
            "/RobotControl",
            self.handle_robot_control,
        )

        self.get_logger().info("Demo /RobotControl service server started")

    def handle_robot_control(self, request, response):
        self.get_logger().info("Received /RobotControl request")

        request_fields = request.get_fields_and_field_types()

        for field_name in request_fields:
            value = getattr(request, field_name)
            self.get_logger().info(f"request.{field_name} = {value}")

        response_fields = response.get_fields_and_field_types()

        if "success" in response_fields:
            response.success = True

        if "message" in response_fields:
            response.message = "demo RobotControl response ok"

        if "ctrl_code" in response_fields:
            response.ctrl_code = 0

        if "response_can_id" in response_fields:
            response.response_can_id = 0x102

        if "result" in response_fields:
            response.result = "ok"

        self.get_logger().info("Send /RobotControl response")

        return response


def main(args=None):
    rclpy.init(args=args)

    node = DemoRobotControlService()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
