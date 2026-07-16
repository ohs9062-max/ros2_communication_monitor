import sys
import types


utilities = types.ModuleType('rosidl_runtime_py.utilities')
utilities.get_message = lambda _type: FakeMessage
runtime_package = types.ModuleType('rosidl_runtime_py')
sys.modules.setdefault('rosidl_runtime_py', runtime_package)
sys.modules.setdefault('rosidl_runtime_py.utilities', utilities)

from ros2_dashboard_backend.interface_receive_runtime import InterfaceReceiveRuntime


class FakeNode:
    def __init__(self):
        self.subscriptions = []

    def create_subscription(self, message_class, topic_name, callback, qos):
        subscription = {
            'message_class': message_class,
            'topic_name': topic_name,
            'callback': callback,
            'qos': qos,
        }
        self.subscriptions.append(subscription)
        return subscription

    def destroy_subscription(self, subscription):
        self.subscriptions.remove(subscription)


class FakeMessage:
    def __init__(self, data='hello'):
        self.data = data

    def get_fields_and_field_types(self):
        return {'data': 'string'}


def test_topic_receive_history_limit_and_stop(monkeypatch):
    node = FakeNode()
    runtime = InterfaceReceiveRuntime(lock=DummyLock(), node_getter=lambda: node)
    monkeypatch.setattr(
        'ros2_dashboard_backend.interface_receive_runtime.get_message',
        lambda _type: FakeMessage,
    )

    runtime.start_topic(
        topic_name='/demo',
        topic_type='std_msgs/msg/String',
        history_limit=2,
    )
    callback = node.subscriptions[0]['callback']
    callback(FakeMessage('one'))
    callback(FakeMessage('two'))
    callback(FakeMessage('three'))

    history = runtime.topic_history(topic_name='/demo')['history']
    assert [item['message_json']['data'] for item in history] == ['three', 'two']

    runtime.stop_topic(topic_name='/demo')
    assert node.subscriptions == []


def test_topic_receive_history_reset(monkeypatch):
    node = FakeNode()
    runtime = InterfaceReceiveRuntime(lock=DummyLock(), node_getter=lambda: node)
    monkeypatch.setattr(
        'ros2_dashboard_backend.interface_receive_runtime.get_message',
        lambda _type: FakeMessage,
    )

    runtime.start_topic(
        topic_name='/demo',
        topic_type='std_msgs/msg/String',
    )
    callback = node.subscriptions[0]['callback']
    callback(FakeMessage('one'))
    callback(FakeMessage('two'))

    result = runtime.reset_topic_history(topic_name='/demo')

    assert result == {'cleared': 2, 'topic_name': '/demo'}
    assert runtime.topic_history(topic_name='/demo')['history'] == []
    assert runtime.topics()['topics'][0]['last_message'] is None


class DummyLock:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False
