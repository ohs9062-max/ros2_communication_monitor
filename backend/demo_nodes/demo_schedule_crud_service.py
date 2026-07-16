#!/usr/bin/env python3

import rclpy
from rclpy.node import Node

from demo_interface_imports import import_demo_interface


ScheduleCrud = import_demo_interface(
    "srv",
    "ScheduleCrud",
    ["rths_interfaces", "ros2_dashboard_interfaces"],
)


class DemoScheduleCrudService(Node):
    def __init__(self):
        super().__init__("demo_schedule_crud_service")

        self._service = self.create_service(
            ScheduleCrud,
            "/ScheduleCrud",
            self.handle_schedule_crud,
        )

        self.get_logger().info(
            "Demo /ScheduleCrud service server started"
        )

    def handle_schedule_crud(self, request, response):
        self.get_logger().info("Received /ScheduleCrud request")

        request_fields = request.get_fields_and_field_types()
        for field_name in request_fields:
            value = getattr(request, field_name)
            self.get_logger().info(
                f"request.{field_name} = {value}"
            )

        response_fields = response.get_fields_and_field_types()

        if "success" in response_fields:
            response.success = True

        if "message" in response_fields:
            response.message = self._message_for_request(request)

        if "items" in response_fields:
            response.items = self._response_items(request)

        self.get_logger().info("Send /ScheduleCrud response")

        return response

    def _message_for_request(self, request):
        cmd = getattr(request, "cmd", None)
        table_name = getattr(request, "table_name", "")
        label = {
            1: "CREATE",
            2: "READ",
            3: "UPDATE",
            4: "DELETE",
            5: "LIST",
        }.get(cmd, f"cmd={cmd}")
        return f"demo ScheduleCrud {label} ok table={table_name}"

    def _response_items(self, request):
        incoming_items = list(getattr(request, "items", []))
        if incoming_items:
            return incoming_items
        return []


def main(args=None):
    rclpy.init(args=args)

    node = DemoScheduleCrudService()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
