#!/bin/bash

# Claude Code notification hook.
# Starts the local server if needed, then forwards the hook JSON.
# Always exits 0 and prints no hook decision.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/ensure-server.sh" || true
node "$SCRIPT_DIR/send-notification.mjs" || true
exit 0
