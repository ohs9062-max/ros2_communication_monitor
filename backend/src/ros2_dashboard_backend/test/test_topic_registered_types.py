from threading import Lock
from time import sleep, time
from pathlib import Path

import yaml
from rths_interfaces.msg import CleaningSchedule

from ros2_dashboard_backend.config_loader import (
    MonitorConfig,
    _monitor_config,
    _registered_message_types,
)
from ros2_dashboard_backend.topic.filters import is_supported_type
from ros2_dashboard_backend.topic.alerts import (
    build_alert_meta,
    build_alerts,
    retain_alerts,
)
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
    assert config.topics_registered_types == (
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
            topics_registered_types=(topic_type,),
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


def test_registered_custom_message_reports_missing_and_stale_alerts() -> None:
    topic_type = 'rths_interfaces/msg/CleaningSchedule'
    node = _FakeNode()
    node.publisher_count = 1
    runtime = TopicRuntime(
        action_monitor_subscriber_count=lambda _name: 0,
        config=MonitorConfig(
            stale_timeout_sec=3.0,
            topics_supported_types=(topic_type,),
            topics_registered_types=(topic_type,),
        ),
        lock=Lock(),
        node_getter=lambda: node,
    )

    runtime.update()
    topics, subscriptions = runtime.alert_snapshot()
    missing_alerts = build_alerts(
        topics=topics,
        subscriptions=subscriptions,
        detected_at=time() + 4.0,
        stale_timeout_sec=3.0,
    )

    assert topics[0]['registered_interface_type'] is True
    assert [alert['code'] for alert in missing_alerts] == [
        'topic_message_missing',
    ]

    node.subscriptions[0]['callback'](CleaningSchedule())
    topics, subscriptions = runtime.alert_snapshot()
    stale_alerts = build_alerts(
        topics=topics,
        subscriptions=subscriptions,
        detected_at=time() + 4.0,
        stale_timeout_sec=3.0,
    )

    assert [alert['code'] for alert in stale_alerts] == ['topic_stale']


def test_missing_topic_alert_is_retained_for_sixty_seconds_after_resolution() -> None:
    retained = {}
    active_alert = {
        'id': 'topic:/demo_cleaning_schedule:topic_message_missing',
        'level': 'warning',
        'source': 'topic',
        'name': '/demo_cleaning_schedule',
        'code': 'topic_message_missing',
        'message': 'missing',
        'status': 'never_received',
        'detected_at': 100.0,
    }

    active = retain_alerts(
        current_alerts=[active_alert],
        retained_alerts=retained,
        retained_codes={'topic_message_missing'},
        detected_at=100.0,
    )
    resolved = retain_alerts(
        current_alerts=[],
        retained_alerts=retained,
        retained_codes={'topic_message_missing'},
        detected_at=104.0,
    )
    still_resolved = retain_alerts(
        current_alerts=[],
        retained_alerts=retained,
        retained_codes={'topic_message_missing'},
        detected_at=163.0,
    )
    expired = retain_alerts(
        current_alerts=[],
        retained_alerts=retained,
        retained_codes={'topic_message_missing'},
        detected_at=164.0,
    )

    assert active[0]['alert_state'] == 'active'
    assert active[0]['active'] is True
    assert resolved[0]['alert_state'] == 'resolved'
    assert resolved[0]['active'] is False
    assert resolved[0]['resolved_at'] == 104.0
    assert still_resolved[0]['alert_state'] == 'resolved'
    assert expired == []
    assert build_alert_meta(resolved) == {
        'count': 1,
        'active_count': 0,
        'resolved_count': 1,
        'info_count': 0,
        'warning_count': 0,
        'error_count': 0,
        'critical_count': 0,
    }


def test_stale_topic_alert_remains_active_while_fault_continues() -> None:
    retained = {}
    stale_alert = {
        'id': 'topic:/demo_cleaning_schedule:topic_stale',
        'level': 'warning',
        'source': 'topic',
        'name': '/demo_cleaning_schedule',
        'code': 'topic_stale',
        'message': 'stale',
        'status': 'stale',
        'detected_at': 100.0,
    }

    retain_alerts(
        current_alerts=[stale_alert],
        retained_alerts=retained,
        retained_codes={'topic_stale'},
        detected_at=100.0,
    )
    active = retain_alerts(
        current_alerts=[stale_alert],
        retained_alerts=retained,
        retained_codes={'topic_stale'},
        detected_at=112.0,
    )

    assert active[0]['alert_state'] == 'active'
    assert active[0]['active'] is True
    assert active[0]['first_detected_at'] == 100.0
    assert active[0]['last_detected_at'] == 112.0


def test_resolved_alert_recurrence_reactivates_existing_entry() -> None:
    retained = {}
    alert = {
        'id': 'topic:/demo_cleaning_schedule:topic_stale',
        'level': 'warning',
        'source': 'topic',
        'name': '/demo_cleaning_schedule',
        'code': 'topic_stale',
        'message': 'stale',
        'status': 'stale',
        'detected_at': 100.0,
    }

    retain_alerts(
        current_alerts=[alert],
        retained_alerts=retained,
        retained_codes={'topic_stale'},
        detected_at=100.0,
    )
    retain_alerts(
        current_alerts=[],
        retained_alerts=retained,
        retained_codes={'topic_stale'},
        detected_at=110.0,
    )
    recurrence = retain_alerts(
        current_alerts=[alert],
        retained_alerts=retained,
        retained_codes={'topic_stale'},
        detected_at=120.0,
    )

    assert recurrence[0]['alert_state'] == 'active'
    assert recurrence[0]['active'] is True
    assert recurrence[0]['resolved_at'] is None
    assert recurrence[0]['first_detected_at'] == 100.0
    assert recurrence[0]['last_detected_at'] == 120.0


def test_resolved_alert_history_keeps_latest_fifty_once_per_resolution() -> None:
    retained = {}
    history = []

    for index in range(52):
        alert = {
            'id': f'topic:/demo_{index}:topic_stale',
            'level': 'warning',
            'source': 'topic',
            'name': f'/demo_{index}',
            'code': 'topic_stale',
            'message': 'stale',
            'status': 'stale',
            'detected_at': float(index),
        }
        retain_alerts(
            alert_history=history,
            current_alerts=[alert],
            retained_alerts=retained,
            retained_codes={'topic_stale'},
            detected_at=float(index),
        )
        retain_alerts(
            alert_history=history,
            current_alerts=[],
            retained_alerts=retained,
            retained_codes={'topic_stale'},
            detected_at=float(index) + 0.5,
        )
        retain_alerts(
            alert_history=history,
            current_alerts=[],
            retained_alerts=retained,
            retained_codes={'topic_stale'},
            detected_at=float(index) + 0.75,
        )

    assert len(history) == 50
    assert history[0]['name'] == '/demo_51'
    assert history[-1]['name'] == '/demo_2'
    assert all(alert['alert_state'] == 'resolved' for alert in history)
    assert all(alert['active'] is False for alert in history)


def test_monitor_only_topic_subscription_is_removed_but_state_is_retained(
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
    disconnected = runtime.snapshot()['topics'][0]
    assert disconnected['status'] == 'disconnected'
    assert disconnected['graph_present'] is False
    assert disconnected['publisher_count'] == 0
    assert disconnected['external_subscriber_count'] == 0


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
