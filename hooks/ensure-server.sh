#!/bin/bash

# Ensure the Claude Code notification server is running
# Uses lock file to prevent race conditions when multiple instances start simultaneously

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")/server"
HEALTH_URL="http://localhost:3099/health"
LOCK_FILE="/tmp/claude-notify-server.lock"
PID_FILE="/tmp/claude-notify-server.pid"
MAX_WAIT=5  # Maximum seconds to wait for server startup

# Function to check if server is responding
check_health() {
  curl -s --connect-timeout 1 --max-time 2 "$HEALTH_URL" > /dev/null 2>&1
}

# If server is already running, we're done
if check_health; then
  exit 0
fi

# Portable file locking function (works on both Linux and macOS)
acquire_lock() {
  local lock_fd=200
  local timeout=10
  local waited=0

  # Create lock file if it doesn't exist
  touch "$LOCK_FILE"

  # Try to acquire lock
  while [ $waited -lt $timeout ]; do
    # Use mkdir as atomic lock (portable across Linux/macOS)
    if mkdir "${LOCK_FILE}.d" 2>/dev/null; then
      trap 'rmdir "${LOCK_FILE}.d" 2>/dev/null' EXIT
      return 0
    fi
    sleep 0.5
    waited=$((waited + 1))
  done

  return 1
}

# Server not running, need to start it
# Acquire lock to prevent race conditions when multiple Claude instances start simultaneously
if ! acquire_lock; then
  # Could not acquire lock, another process is starting the server
  # Wait a bit and check if server is now running
  sleep 2
  if check_health; then
    exit 0
  fi
  exit 1
fi

# Double-check health after acquiring lock (another process may have started it)
if check_health; then
  exit 0
fi

# Check if there's a stale PID file
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
  if [ -n "$OLD_PID" ] && ! kill -0 "$OLD_PID" 2>/dev/null; then
    # Process doesn't exist, remove stale PID file
    rm -f "$PID_FILE"
  fi
fi

# Start the server with the node binary recorded at install time.
NODE_BIN="${CLAUDE_NOTIFY_NODE:-}"
if [ -z "$NODE_BIN" ] && [ -f "$SCRIPT_DIR/node-path" ]; then
  IFS= read -r NODE_BIN < "$SCRIPT_DIR/node-path"
fi
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "claude-code-notify: node is not executable at ${NODE_BIN:-unknown}" >&2
  exit 1
fi

cd "$SERVER_DIR" || exit 1
nohup "$NODE_BIN" dist/index.js > /tmp/claude-notify-server.log 2>&1 &

# Wait for server to be ready
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  sleep 0.5
  WAITED=$((WAITED + 1))
  if check_health; then
    exit 0
  fi
done

echo "claude-code-notify: notification server did not become ready" >&2
exit 1
