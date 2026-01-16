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

# Server not running, need to start it
# Use flock to prevent race conditions when multiple Claude instances start simultaneously
(
  # Acquire exclusive lock (wait up to 10 seconds)
  flock -w 10 200 || exit 1

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

  # Start the server
  cd "$SERVER_DIR" || exit 1
  nohup node index.js > /tmp/claude-notify-server.log 2>&1 &

  # Wait for server to be ready
  WAITED=0
  while [ $WAITED -lt $MAX_WAIT ]; do
    sleep 0.5
    WAITED=$((WAITED + 1))
    if check_health; then
      exit 0
    fi
  done

  # Server didn't start in time, but don't fail - let the notification continue anyway
  exit 0

) 200>"$LOCK_FILE"

exit 0
