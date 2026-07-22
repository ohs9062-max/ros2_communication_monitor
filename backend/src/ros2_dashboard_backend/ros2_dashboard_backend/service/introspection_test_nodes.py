"""Service 모니터링의 introspection_test_nodes 관련 기능을 담당하는 모듈입니다."""

from __future__ import annotations

import argparse

import rclpy
from example_interfaces.srv import AddTwoInts
from rclpy.node import Node
from rclpy.qos import qos_profile_services_default
from rclpy.service_introspection import ServiceIntrospectionState


SERVICE_NAME = '/introspection_add_two_ints'


class IntrospectionAddTwoIntsServer(Node):
    """Service 모니터링의 IntrospectionAddTwoIntsServer 역할을 담당하는 클래스입니다."""

    def __init__(self) -> None:
        """Service 모니터링에서 내부 보조 처리를 수행하는 내부 helper 함수입니다."""
        super().__init__('introspection_add_two_ints_server')
        self._service = self.create_service(
            AddTwoInts,
            SERVICE_NAME,
            self._handle_request,
        )
        self._service.configure_introspection(
            self.get_clock(),
            qos_profile_services_default,
            ServiceIntrospectionState.CONTENTS,
        )
        self.get_logger().info(
            f'Service introspection enabled for {SERVICE_NAME}',
        )

    def _handle_request(
        self,
        request: AddTwoInts.Request,
        response: AddTwoInts.Response,
    ) -> AddTwoInts.Response:
        response.sum = request.a + request.b
        self.get_logger().info(
            f'Request a={request.a} b={request.b} sum={response.sum}',
        )
        return response


class IntrospectionAddTwoIntsClient(Node):
    """Service 모니터링의 IntrospectionAddTwoIntsClient 역할을 담당하는 클래스입니다."""

    def __init__(self) -> None:
        """Service 모니터링에서 내부 보조 처리를 수행하는 내부 helper 함수입니다."""
        super().__init__('introspection_add_two_ints_client')
        self.client = self.create_client(AddTwoInts, SERVICE_NAME)
        self.client.configure_introspection(
            self.get_clock(),
            qos_profile_services_default,
            ServiceIntrospectionState.CONTENTS,
        )
        self.get_logger().info(
            f'Client introspection enabled for {SERVICE_NAME}',
        )

    def call_once(self, a: int, b: int) -> None:
        """Service 모니터링에서 요청된 처리를 수행하는 함수입니다."""
        if not self.client.wait_for_service(timeout_sec=5.0):
            self.get_logger().error(f'Service not available: {SERVICE_NAME}')
            return

        request = AddTwoInts.Request()
        request.a = a
        request.b = b
        future = self.client.call_async(request)
        rclpy.spin_until_future_complete(self, future, timeout_sec=5.0)
        if not future.done():
            self.get_logger().error('Service call timed out.')
            return

        response = future.result()
        self.get_logger().info(
            f'Response sum={response.sum} for a={a} b={b}',
        )


def server_main(args: list[str] | None = None) -> None:
    """Service 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    rclpy.init(args=args)
    node = IntrospectionAddTwoIntsServer()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


def client_main(args: list[str] | None = None) -> None:
    """Service 모니터링에서 요청된 처리를 수행하는 함수입니다."""
    parser = argparse.ArgumentParser()
    parser.add_argument('--a', type=int, default=1)
    parser.add_argument('--b', type=int, default=2)
    parsed_args = parser.parse_args(args)

    rclpy.init(args=args)
    node = IntrospectionAddTwoIntsClient()
    try:
        node.call_once(parsed_args.a, parsed_args.b)
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()
