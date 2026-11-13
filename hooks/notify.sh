#!/bin/bash
set -euo pipefail

# Claude Code notification hook.
# Uses the node binary recorded at install time. A failed server start or
# a failed notification exits non-zero and prints no hook decision.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_PATH_FILE="$SCRIPT_DIR/node-path"

if [ ! -f "$NODE_PATH_FILE" ]; then
  echo "claude-code-notify: missing $NODE_PATH_FILE. Re-run the installer." >&2
  exit 1
fi

IFS= read -r NODE_BIN < "$NODE_PATH_FILE"
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "claude-code-notify: node is not executable at ${NODE_BIN:-$NODE_PATH_FILE}" >&2
  exit 1
fi

export CLAUDE_NOTIFY_NODE="$NODE_BIN"
"$SCRIPT_DIR/ensure-server.sh"
exec "$NODE_BIN" "$SCRIPT_DIR/send-notification.mjs"
