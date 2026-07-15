#!/usr/bin/env bash
set -e

SESSION="ros2_dashboard"

PROJECT_DIR="$HOME/rang/ros2_dashboard"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

tmux has-session -t "$SESSION" 2>/dev/null && {
  echo "tmux session already exists: $SESSION"
  echo "Attach with: tmux attach -t $SESSION"
  exit 1
}

tmux new-session -d -s "$SESSION" -n gazebo

tmux send-keys -t "$SESSION:0" "
cd $PROJECT_DIR
source /opt/ros/jazzy/setup.bash
export TURTLEBOT3_MODEL=burger
ros2 launch turtlebot3_gazebo turtlebot3_world.launch.py
" C-m

tmux new-window -t "$SESSION" -n nav2
tmux send-keys -t "$SESSION:1" "
cd $PROJECT_DIR
source /opt/ros/jazzy/setup.bash
export TURTLEBOT3_MODEL=burger
ros2 launch turtlebot3_navigation2 navigation2.launch.py use_sim_time:=True
" C-m

tmux new-window -t "$SESSION" -n backend
tmux send-keys -t "$SESSION:2" "
cd $BACKEND_DIR
source /opt/ros/jazzy/setup.bash
source .venv/bin/activate
colcon build --symlink-install
source install/setup.bash
python3 -m uvicorn ros2_dashboard_backend.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --reload
" C-m

tmux new-window -t "$SESSION" -n frontend
tmux send-keys -t "$SESSION:3" "
cd $FRONTEND_DIR
npm run dev
" C-m

tmux attach -t "$SESSION"
