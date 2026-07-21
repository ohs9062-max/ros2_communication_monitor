#!/usr/bin/env python3

import time

import rclpy
from rclpy.action import ActionServer
from rclpy.node import Node

from demo_interface_imports import import_demo_interface

CanControl = import_demo_interface(
    "action",
    "CanControl",
    [
        "rths_interfaces",
        "ros2_dashboard_interfaces",
        "uploaded_interfaces",
        "uploaded_interfaces_package",
    ],
)


class DemoCanControlServer(Node):
    def __init__(self):
        super().__init__("demo_can_control_server")

        self._action_server = ActionServer(
            self,
            CanControl,
            "/CanControl",
            self.execute_callback,
        )

        self.get_logger().info("Demo /CanControl action server started")

    def execute_callback(self, goal_handle):
        goal = goal_handle.request

        self.get_logger().info(
            "Received goal: "
            f"node_id={goal.node_id}, "
            f"port={goal.port}, "
            f"value={goal.value}, "
            f"retries={goal.retries}, "
            f"timeout_ms={goal.timeout_ms}"
        )

        feedback = CanControl.Feedback()

        retry_count = goal.retries
        if retry_count == 0:
            retry_count = 1

        for attempt in range(1, retry_count + 1):
            feedback.stage = "sending"
            feedback.attempt = attempt
            feedback.detail = f"demo send attempt {attempt}/{retry_count}"

            goal_handle.publish_feedback(feedback)

            self.get_logger().info(
                f"Feedback: {feedback.stage}, "
                f"attempt={feedback.attempt}, "
                f"detail={feedback.detail}"
            )

            time.sleep(0.5)

        goal_handle.succeed()

        result = CanControl.Result()
        result.success = True
        result.ctrl_code = 0
        result.response_can_id = 0x102
        result.message = (
            "demo success: "
            f"node_id={goal.node_id}, "
            f"port={goal.port}, "
            f"value={goal.value}"
        )

        self.get_logger().info(
            "Result: "
            f"success={result.success}, "
            f"ctrl_code={result.ctrl_code}, "
            f"response_can_id={result.response_can_id}, "
            f"message={result.message}"
        )

        return result


def main(args=None):
    rclpy.init(args=args)

    node = DemoCanControlServer()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
