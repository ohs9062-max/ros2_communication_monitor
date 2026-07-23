#!/usr/bin/env python3

from datetime import datetime

import rclpy
from rclpy.node import Node

from demo_interface_imports import import_demo_interface


CleaningSchedule = import_demo_interface(
    "msg",
    "CleaningSchedule",
    [
         "rths_interfaces",
        "ros2_dashboard_interfaces",
        "uploaded_interfaces",
        "uploaded_interfaces_package",
    ],
)


class DemoCleaningScheduleTopicPublisher(Node):
    def __init__(self):
        super().__init__(
            "demo_cleaning_schedule_topic_publisher"
        )

        self._topic_name = "/demo_cleaning_schedule"

        self._publisher = self.create_publisher(
            CleaningSchedule,
            self._topic_name,
            10,
        )

        self._scheduling_id = 1
        self._count = 0
        self._is_active = True

        self._timer = self.create_timer(
             1.0,
             self.publish_cleaning_schedule,
         )

        self.get_logger().info(
            f"Demo {self._topic_name} topic "
            "publisher started"
        )

        self.get_logger().info(
            "Message type: "
            "rths_interfaces/msg/CleaningSchedule "
            "or "
            "ros2_dashboard_interfaces/msg/"
            "CleaningSchedule"
        )

        self.get_logger().info(
            "Publish interval: 1.0 second"
        )

    def publish_cleaning_schedule(self):
        msg = CleaningSchedule()

        msg.scheduling_id = self._scheduling_id
        msg.scheduling_dt = datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        msg.count = self._count
        msg.is_active = self._is_active

        self._publisher.publish(msg)

        self.get_logger().info(
            f"Published {self._topic_name}: "
            f"scheduling_id={msg.scheduling_id}, "
            f"scheduling_dt={msg.scheduling_dt}, "
            f"count={msg.count}, "
            f"is_active={msg.is_active}"
        )

        self._scheduling_id += 1
        self._count = (self._count + 1) % 256

        if self._scheduling_id % 5 == 0:
            self._is_active = not self._is_active


def main(args=None):
    rclpy.init(args=args)

    node = DemoCleaningScheduleTopicPublisher()

    try:
        rclpy.spin(node)

    except KeyboardInterrupt:
        pass

    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()