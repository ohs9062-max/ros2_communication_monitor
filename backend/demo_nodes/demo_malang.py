#!/usr/bin/env python3

import random

import rclpy
from rclpy.node import Node

from demo_interface_imports import import_demo_interface


Malang = import_demo_interface(
    "msg",
    "Malang",
    [
        "rths_interfaces",
        "ros2_dashboard_interfaces",
        "uploaded_interfaces",
        "uploaded_interfaces_package",
    ],
)


class DemoMalangTopicPublisher(Node):
    def __init__(self):
        super().__init__(
            "demo_malang_topic_publisher"
        )

        self._topic_name = "/demo_malang"

        self._publisher = self.create_publisher(
            Malang,
            self._topic_name,
            10,
        )

        self._cmd = 0
        self._success = True

        # self._timer = self.create_timer(
        #     1.0,
        #     self.publish_malang,
        #)

        self.get_logger().info(
            f"Demo {self._topic_name} topic "
            "publisher started"
        )

        self.get_logger().info(
            "Message type: "
            "rths_interfaces/msg/Malang "
            "or "
            "ros2_dashboard_interfaces/msg/Malang"
        )

        self.get_logger().info(
            "Publish interval: 1.0 second"
        )

    def publish_malang(self):
        msg = Malang()

        msg.cmd = self._cmd
        msg.success = self._success
        msg.message = (
            f"cmd={self._cmd} at count tick"
        )

        self._publisher.publish(msg)

        self.get_logger().info(
            f"Published {self._topic_name}: "
            f"cmd={msg.cmd}, "
            f"success={msg.success}, "
            f"message={msg.message}"
        )

        self._cmd = (self._cmd + 1) % 256

        if self._cmd % 5 == 0:
            self._success = not self._success


def main(args=None):
    rclpy.init(args=args)

    node = DemoMalangTopicPublisher()

    try:
        rclpy.spin(node)

    except KeyboardInterrupt:
        pass

    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()