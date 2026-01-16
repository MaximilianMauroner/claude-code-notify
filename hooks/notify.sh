#!/bin/bash

# Claude Code Notification Hook Script
# Sends notifications to the local WebSocket server for browser notifications

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="http://localhost:3099/notify"

# Ensure the server is running before sending notification
"$SCRIPT_DIR/ensure-server.sh"

# Read the hook event from stdin (JSON format)
read -r EVENT_JSON

# Extract the hook name from environment or try to parse from JSON
HOOK_NAME="${CLAUDE_HOOK_NAME:-unknown}"

# Determine notification type based on hook event
case "$HOOK_NAME" in
  "permission_prompt")
    TYPE="permission_prompt"
    MESSAGE="Claude Code needs your permission to proceed"
    ;;
  "idle_prompt")
    TYPE="idle_prompt"
    MESSAGE="Claude Code is waiting for your input"
    ;;
  "stop")
    TYPE="stop"
    MESSAGE="Claude Code has finished and is ready for your next instruction"
    ;;
  *)
    # Try to determine type from the event JSON
    if echo "$EVENT_JSON" | grep -q '"type"'; then
      TYPE=$(echo "$EVENT_JSON" | grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)".*/\1/')
    else
      TYPE="notification"
    fi
    MESSAGE="Claude Code notification"
    ;;
esac

# Try to extract a more specific message from the event if available
if [ -n "$EVENT_JSON" ]; then
  EXTRACTED_MSG=$(echo "$EVENT_JSON" | grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)".*/\1/' 2>/dev/null)
  if [ -n "$EXTRACTED_MSG" ]; then
    MESSAGE="$EXTRACTED_MSG"
  fi
fi

# Create the notification payload
PAYLOAD=$(cat <<EOF
{
  "type": "$TYPE",
  "message": "$MESSAGE",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
)

# Send notification to the server (timeout after 2 seconds, fail silently)
curl -s -X POST "$SERVER_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --connect-timeout 2 \
  --max-time 5 \
  > /dev/null 2>&1 || true

# Always exit successfully so we don't block Claude Code
exit 0
