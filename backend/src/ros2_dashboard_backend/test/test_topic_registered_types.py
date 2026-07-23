from threading import Lock
from time import sleep
from pathlib import Path

import yaml
from rths_interfaces.msg import CleaningSchedule

from ros2_dashboard_backend.config_loader import (
    MonitorConfig,
    _monitor_config,
    _registered_message_types,
)
from ros2_dashboard_backend.topic.filters import is_supported_type
from ros2_dashboard_backend.topic.runtime import TopicRuntime


class _FakeNode:
    def __init__(self) -> None:
        self.subscriptions = []
        self.publisher_count = 0
        self.external_subscriber_count = 0
        self.topic_name = '/demo_cleaning_schedule'
        self.topic_type = 'rths_interfaces/msg/CleaningSchedule'

    def create_subscription(self, message_class, topic_name, callback, qos):
        subscription = {
            'message_class': message_class,
            'topic_name': topic_name,
            'callback': callback,
            'qos': qos,
        }
        self.subscriptions.append(subscription)
        return subscription

    def destroy_subscription(self, subscription) -> None:
        self.subscriptions.remove(subscription)

    def get_topic_names_and_types(self):
        if (
            self.publisher_count > 0
            or self.external_subscriber_count > 0
            or self.subscriptions
        ):
            return [(self.topic_name, [self.topic_type])]
        return []

    def count_publishers(self, _topic_name):
        return self.publisher_count

    def count_subscribers(self, _topic_name):
        return self.external_subscriber_count + len(self.subscriptions)


def test_registered_importable_messages_extend_monitor_supported_types(
    tmp_path: Path,
    monkeypatch,
) -> None:
    config_dir = tmp_path / 'config'
    config_dir.mkdir()
    (config_dir / 'interface_registry.yaml').write_text(
        yaml.safe_dump({
            'interface_registry': {
                'messages': [{
                    'full_type': 'uploaded_interfaces/msg/Ready',
                    'build': {'import_available': True},
                }],
            },
        }),
        encoding='utf-8',
    )
    (config_dir / 'interface_packages.yaml').write_text(
        yaml.safe_dump({
            'packages': [{
                'interfaces': {
                    'msg': [{
                        'type': 'rths_interfaces/msg/CleaningSchedule',
                        'import_available': True,
                    }],
                },
            }],
        }),
        encoding='utf-8',
    )
    monkeypatch.delenv('INTERFACE_REGISTRY_PATH', raising=False)
    monkeypatch.delenv('INTERFACE_PACKAGES_REGISTRY_PATH', raising=False)

    registered_types = _registered_message_types(tmp_path)
    config = _monitor_config(
        {'topics': {'supported_types': ['sensor_msgs/msg/LaserScan']}},
        registered_message_types=registered_types,
    )

    assert config.topics_supported_types == (
        'sensor_msgs/msg/LaserScan',
        'uploaded_interfaces/msg/Ready',
        'rths_interfaces/msg/CleaningSchedule',
    )
    assert is_supported_type(
        'rths_interfaces/msg/CleaningSchedule',
        supported_types=config.topics_supported_types,
    )


def test_registered_custom_message_is_subscribed_and_measures_hz() -> None:
    topic_type = 'rths_interfaces/msg/CleaningSchedule'
    node = _FakeNode()
    runtime = TopicRuntime(
        action_monitor_subscriber_count=lambda _name: 0,
        config=MonitorConfig(
            hz_window_sec=5.0,
            topics_supported_types=(topic_type,),
        ),
        lock=Lock(),
        node_getter=lambda: node,
    )

    assert runtime._auto_subscribe_topic(
        '/demo_cleaning_schedule',
        topic_type,
        supported_type=True,
    )
    callback = node.subscriptions[0]['callback']
    callback(CleaningSchedule())
    sleep(0.01)
    callback(CleaningSchedule())

    snapshot = runtime._topic_hz_snapshot(
        '/demo_cleaning_schedule',
        topic_type,
    )

    assert snapshot['success'] is True
    assert snapshot['data']['received'] is True
    assert snapshot['data']['last_received_at'] is not None
    assert snapshot['data']['message_count'] == 2
    assert snapshot['data']['hz'] > 0


def test_monitor_only_topic_is_removed_after_cleanup_grace_period(
    monkeypatch,
) -> None:
    topic_type = 'rths_interfaces/msg/CleaningSchedule'
    node = _FakeNode()
    node.publisher_count = 1
    runtime = TopicRuntime(
        action_monitor_subscriber_count=lambda _name: 0,
        config=MonitorConfig(topics_supported_types=(topic_type,)),
        lock=Lock(),
        node_getter=lambda: node,
    )
    monkeypatch.setattr(
        'ros2_dashboard_backend.topic.runtime.'
        'DEFAULT_SUBSCRIPTION_CLEANUP_AFTER_SEC',
        0.0,
    )

    runtime.update()
    assert len(node.subscriptions) == 1

    node.publisher_count = 0
    runtime.update()
    runtime.update()
    assert node.subscriptions == []

    runtime.update()
    assert runtime.snapshot()['topics'] == []


def test_external_subscriber_keeps_waiting_topic_monitored(
    monkeypatch,
) -> None:
    topic_type = 'rths_interfaces/msg/CleaningSchedule'
    node = _FakeNode()
    node.publisher_count = 1
    runtime = TopicRuntime(
        action_monitor_subscriber_count=lambda _name: 0,
        config=MonitorConfig(topics_supported_types=(topic_type,)),
        lock=Lock(),
        node_getter=lambda: node,
    )
    monkeypatch.setattr(
        'ros2_dashboard_backend.topic.runtime.'
        'DEFAULT_SUBSCRIPTION_CLEANUP_AFTER_SEC',
        0.0,
    )

    runtime.update()
    node.publisher_count = 0
    node.external_subscriber_count = 1
    runtime.update()
    runtime.update()

    assert len(node.subscriptions) == 1
    assert runtime.snapshot()['topics'][0]['status'] == 'waiting_publisher'
