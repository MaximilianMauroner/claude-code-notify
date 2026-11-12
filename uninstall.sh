#!/bin/bash

# Claude Code Notification Extension - Uninstaller
# Removes the notification extension and cleans up all related files

INSTALL_DIR="$HOME/.claude/claude-code-notify"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
PID_FILE="/tmp/claude-notify-server.pid"
LOCK_FILE="/tmp/claude-notify-server.lock"
LOCK_DIR="/tmp/claude-notify-server.lock.d"
LOG_FILE="/tmp/claude-notify-server.log"

echo "====================================="
echo "Claude Code Notification Uninstaller"
echo "====================================="
echo ""

# Step 1: Remove hooks from Claude settings
remove_hooks_from_settings() {
  echo "[1/4] Removing hooks from Claude settings..."

  if [ ! -f "$CLAUDE_SETTINGS" ]; then
    echo "  - No settings file found, skipping"
    return
  fi

  # Check if node is available
  if ! command -v node &> /dev/null; then
    echo "  - Warning: Node.js not found, cannot remove hooks from settings"
    echo "  - Please manually edit $CLAUDE_SETTINGS to remove hooks"
    return
  fi

  # Backup settings before modification
  cp "$CLAUDE_SETTINGS" "$CLAUDE_SETTINGS.backup.$(date +%Y%m%d_%H%M%S)"

  node "$INSTALL_DIR/hooks/claude-settings.mjs" uninstall "$CLAUDE_SETTINGS"
}

# Step 2: Stop running server
stop_server() {
  echo "[2/4] Stopping notification server..."

  # Try to kill by PID file
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null
      echo "  - Stopped server (PID: $PID)"
    else
      echo "  - Server was not running"
    fi
    rm -f "$PID_FILE"
  else
    # Try to find and kill by process name/port
    if command -v lsof &> /dev/null; then
      PID=$(lsof -ti:3099 2>/dev/null)
      if [ -n "$PID" ]; then
        kill "$PID" 2>/dev/null
        echo "  - Stopped server on port 3099 (PID: $PID)"
      else
        echo "  - Server was not running"
      fi
    else
      echo "  - Could not check for running server (lsof not available)"
    fi
  fi
}

# Step 3: Remove installation directory
remove_install_directory() {
  echo "[3/4] Removing installation directory..."

  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo "  - Removed $INSTALL_DIR"
  else
    echo "  - Installation directory not found, skipping"
  fi
}

# Step 4: Clean up temporary files
cleanup_temp_files() {
  echo "[4/4] Cleaning up temporary files..."

  local cleaned=0

  if [ -f "$LOCK_FILE" ]; then
    rm -f "$LOCK_FILE"
    cleaned=$((cleaned + 1))
  fi

  if [ -d "$LOCK_DIR" ]; then
    rmdir "$LOCK_DIR" 2>/dev/null
    cleaned=$((cleaned + 1))
  fi

  if [ -f "$LOG_FILE" ]; then
    rm -f "$LOG_FILE"
    cleaned=$((cleaned + 1))
  fi

  if [ -f "$PID_FILE" ]; then
    rm -f "$PID_FILE"
    cleaned=$((cleaned + 1))
  fi

  if [ $cleaned -gt 0 ]; then
    echo "  - Removed $cleaned temporary file(s)"
  else
    echo "  - No temporary files to clean up"
  fi
}

# Print final message
print_final_message() {
  echo ""
  echo "====================================="
  echo "  UNINSTALL COMPLETE"
  echo "====================================="
  echo ""
  echo "The Claude Code notification extension has been removed."
  echo ""
  echo "Note: You may need to manually remove the browser extension:"
  echo ""
  echo "For Chrome/Chromium/Brave:"
  echo "  1. Open chrome://extensions"
  echo "  2. Find 'Claude Code Notifications'"
  echo "  3. Click 'Remove'"
  echo ""
  echo "For Firefox:"
  echo "  The temporary add-on is automatically removed on restart."
  echo ""
  echo "Settings backup files in ~/.claude/ can be safely deleted"
  echo "if you no longer need them."
  echo ""
}

# Main execution
main() {
  remove_hooks_from_settings
  stop_server
  remove_install_directory
  cleanup_temp_files
  print_final_message
}

main
