from setuptools import find_packages, setup

package_name = 'ros2_dashboard_backend'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='hs',
    maintainer_email='ohs9062@gmail.com',
    description='TODO: Package description',
    license='TODO: License declaration',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
            'introspection_add_two_ints_server = '
            'ros2_dashboard_backend.service.introspection_test_nodes:'
            'server_main',
            'introspection_add_two_ints_client = '
            'ros2_dashboard_backend.service.introspection_test_nodes:'
            'client_main',
        ],
    },
)
