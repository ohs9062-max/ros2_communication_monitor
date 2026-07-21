import sys
import types


class FakeNode:
    def __init__(self):
        self.subscriptions = []
        self.publishers = []
        self.topic_graph = []

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

    def create_publisher(self, message_class, topic_name, qos):
        publisher = FakePublisher(message_class, topic_name, qos)
        self.publishers.append(publisher)
        return publisher

    def destroy_publisher(self, publisher):
        self.publishers.remove(publisher)

    def get_topic_names_and_types(self):
        return self.topic_graph

    def count_publishers(self, topic_name):
        return sum(1 for name, _types in self.topic_graph if name == topic_name)

    def count_subscribers(self, topic_name):
        return 0


class FakePublisher:
    def __init__(self, message_class, topic_name, qos):
        self.message_class = message_class
        self.topic_name = topic_name
        self.qos = qos
        self.messages = []

    def publish(self, message):
        self.messages.append(message)


class FakeMessage:
    def __init__(self, data='hello'):
        self.data = data

    def get_fields_and_field_types(self):
        return {'data': 'string'}


try:
    import rosidl_runtime_py.utilities  # noqa: F401
except ModuleNotFoundError:
    utilities = types.ModuleType('rosidl_runtime_py.utilities')
    utilities.get_message = lambda _type: FakeMessage
    runtime_package = types.ModuleType('rosidl_runtime_py')
    sys.modules.setdefault('rosidl_runtime_py', runtime_package)
    sys.modules.setdefault('rosidl_runtime_py.utilities', utilities)

from ros2_dashboard_backend.interface_receive_runtime import InterfaceReceiveRuntime


def test_topic_receive_history_limit_and_stop(monkeypatch):
    node = FakeNode()
    runtime = InterfaceReceiveRuntime(lock=DummyLock(), node_getter=lambda: node)
    _registered_message(monkeypatch)
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

    runtime.stop_topic(topic_name='/demo', topic_type='std_msgs/msg/String')
    assert node.subscriptions == []
    stopped = runtime.topics()['topics'][0]
    assert stopped['receiving'] is False
    assert stopped['message_count'] == 3
    assert [item['message_json']['data'] for item in runtime.topic_history(topic_name='/demo')['history']] == ['three', 'two']


def test_topic_receive_history_reset(monkeypatch):
    node = FakeNode()
    runtime = InterfaceReceiveRuntime(lock=DummyLock(), node_getter=lambda: node)
    _registered_message(monkeypatch)
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

    assert result == {'cleared': 2, 'topic_name': '/demo', 'topic_type': None}
    assert runtime.topic_history(topic_name='/demo')['history'] == []
    assert runtime.topics()['topics'][0]['last_message'] is None


def test_topic_receive_allows_same_name_with_different_full_type(monkeypatch):
    node = FakeNode()
    runtime = InterfaceReceiveRuntime(lock=DummyLock(), node_getter=lambda: node)
    _registered_message(monkeypatch, extra_type='other_msgs/msg/String')
    monkeypatch.setattr(
        'ros2_dashboard_backend.interface_receive_runtime.get_message',
        lambda _type: FakeMessage,
    )

    runtime.start_topic(topic_name='/demo', topic_type='std_msgs/msg/String')
    runtime.start_topic(topic_name='/demo', topic_type='other_msgs/msg/String')
    runtime.start_topic(topic_name='/demo', topic_type='std_msgs/msg/String')

    assert len(node.subscriptions) == 2
    states = runtime.topics()['topics']
    assert sorted(item['topic_type'] for item in states) == [
        'other_msgs/msg/String',
        'std_msgs/msg/String',
    ]


def test_topic_publish_records_success_and_reuses_publisher(monkeypatch):
    node = FakeNode()
    runtime = InterfaceReceiveRuntime(lock=DummyLock(), node_getter=lambda: node)
    _registered_message(monkeypatch)
    monkeypatch.setattr(
        'ros2_dashboard_backend.interface_receive_runtime.get_message',
        lambda _type: FakeMessage,
    )

    first = runtime.publish_topic(
        topic_name='/demo',
        topic_type='std_msgs/msg/String',
        payload={'data': 'one'},
    )
    second = runtime.publish_topic(
        topic_name='/demo',
        topic_type='std_msgs/msg/String',
        payload={'data': 'two'},
    )

    assert first['success'] is True
    assert second['success'] is True
    assert len(node.publishers) == 1
    assert [message.data for message in node.publishers[0].messages] == ['one', 'two']
    assert runtime.publish_history()['meta']['count'] == 2


def test_topic_publish_validation_error_does_not_publish(monkeypatch):
    node = FakeNode()
    runtime = InterfaceReceiveRuntime(lock=DummyLock(), node_getter=lambda: node)
    _registered_message(monkeypatch)
    monkeypatch.setattr(
        'ros2_dashboard_backend.interface_receive_runtime.get_message',
        lambda _type: FakeMessage,
    )

    result = runtime.publish_topic(
        topic_name='/demo',
        topic_type='std_msgs/msg/String',
        payload={'bad': 'field'},
    )

    assert result['success'] is False
    assert result['error_type'] == 'validation_error'
    assert result['sent_to_topic'] is False
    assert node.publishers == []


def test_topic_graph_conflict_is_reported(monkeypatch):
    node = FakeNode()
    node.topic_graph = [
        ('/demo', ['std_msgs/msg/String', 'other_msgs/msg/String']),
    ]
    runtime = InterfaceReceiveRuntime(lock=DummyLock(), node_getter=lambda: node)
    _registered_message(monkeypatch)
    monkeypatch.setattr(
        'ros2_dashboard_backend.interface_receive_runtime.get_message',
        lambda _type: FakeMessage,
    )

    state = runtime.start_topic(topic_name='/demo', topic_type='std_msgs/msg/String')

    assert state['graph_state']['type_matches'] is True
    assert state['graph_state']['conflicts'][0]['type'] == 'other_msgs/msg/String'


class DummyLock:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def _registered_message(monkeypatch, extra_type=None):
    messages = [{
        'file_name': 'String.msg',
        'type_name': 'String',
        'parsed': [{'name': 'data', 'type': 'string', 'raw_line': 'string data'}],
        'build': {
            'interface_package': 'std_msgs',
            'import_available': True,
        },
    }]
    if extra_type:
        package, _kind, type_name = extra_type.split('/')
        messages.append({
            'file_name': f'{type_name}.msg',
            'type_name': type_name,
            'parsed': [{'name': 'data', 'type': 'string', 'raw_line': 'string data'}],
            'build': {
                'interface_package': package,
                'import_available': True,
            },
        })
    monkeypatch.setattr(
        'ros2_dashboard_backend.interface_receive_runtime.registry_snapshot',
        lambda: {'interface_registry': {'messages': messages}},
    )
    monkeypatch.setattr(
        'ros2_dashboard_backend.interface_receive_runtime.registered_package_messages',
        lambda: [],
    )
