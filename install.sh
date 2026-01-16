#!/bin/bash
set -e

# Claude Code Notification Extension - Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/MaximilianMauroner/claude-code-notify/main/install.sh | bash

INSTALL_DIR="$HOME/.claude/claude-code-notify"
REPO_URL="https://github.com/MaximilianMauroner/claude-code-notify.git"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"

echo "==================================="
echo "Claude Code Notification Installer"
echo "==================================="
echo ""

# Check for required commands
check_requirements() {
  local missing=()

  if ! command -v git &> /dev/null; then
    missing+=("git")
  fi

  if ! command -v node &> /dev/null; then
    missing+=("node")
  fi

  if ! command -v npm &> /dev/null; then
    missing+=("npm")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    echo "Error: Missing required commands: ${missing[*]}"
    echo "Please install them and try again."
    exit 1
  fi
}

# Step 1: Clone or update repository
clone_or_update_repo() {
  echo "[1/5] Setting up repository..."

  # Ensure ~/.claude directory exists
  mkdir -p "$HOME/.claude"

  if [ -d "$INSTALL_DIR" ]; then
    echo "  - Updating existing installation..."
    cd "$INSTALL_DIR"
    git fetch origin
    git reset --hard origin/main
    echo "  - Updated to latest version"
  else
    echo "  - Cloning repository..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    echo "  - Repository cloned"
  fi
}

# Step 2: Install npm dependencies and build
install_dependencies() {
  echo "[2/5] Installing dependencies and building..."

  # Build server
  cd "$INSTALL_DIR/server"
  npm install --silent
  npm run build --silent
  echo "  - Server built"

  # Build extension
  cd "$INSTALL_DIR/extension"
  npm install --silent
  npm run build --silent
  echo "  - Extension built"
}

# Step 3: Make scripts executable and start server
make_scripts_executable() {
  echo "[3/5] Setting up scripts..."
  chmod +x "$INSTALL_DIR/hooks/notify.sh"
  chmod +x "$INSTALL_DIR/hooks/ensure-server.sh"
  echo "  - Scripts are now executable"

  # Start the server in the background
  echo "  - Starting notification server..."
  "$INSTALL_DIR/hooks/ensure-server.sh"
  echo "  - Server started (will auto-restart when needed)"
}

# Step 4: Backup and configure Claude settings
configure_claude_settings() {
  echo "[4/5] Configuring Claude Code settings..."

  # Create settings file if it doesn't exist
  if [ ! -f "$CLAUDE_SETTINGS" ]; then
    echo "{}" > "$CLAUDE_SETTINGS"
    echo "  - Created new settings file"
  else
    # Backup existing settings
    cp "$CLAUDE_SETTINGS" "$CLAUDE_SETTINGS.backup.$(date +%Y%m%d_%H%M%S)"
    echo "  - Backed up existing settings"
  fi

  # Use Node.js to merge settings (handles JSON properly)
  node -e "
const fs = require('fs');
const settingsPath = '$CLAUDE_SETTINGS';
const installDir = '$INSTALL_DIR';

// Read existing settings
let settings = {};
try {
  const content = fs.readFileSync(settingsPath, 'utf8');
  settings = JSON.parse(content);
} catch (e) {
  settings = {};
}

// Ensure hooks object exists
if (!settings.hooks) {
  settings.hooks = {};
}

// Define the notification hooks with absolute paths
const notifyScript = installDir + '/hooks/notify.sh';

const notificationHooks = [
  {
    matcher: 'permission_prompt',
    hooks: [
      {
        type: 'command',
        command: 'CLAUDE_HOOK_NAME=permission_prompt ' + notifyScript
      }
    ]
  },
  {
    matcher: 'idle_prompt',
    hooks: [
      {
        type: 'command',
        command: 'CLAUDE_HOOK_NAME=idle_prompt ' + notifyScript
      }
    ]
  }
];

const stopHooks = [
  {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: 'CLAUDE_HOOK_NAME=stop ' + notifyScript
      }
    ]
  }
];

// Merge hooks (preserve existing, add/update notification hooks)
// For Notification hooks, we replace existing notification-related hooks
settings.hooks.Notification = notificationHooks;
settings.hooks.Stop = stopHooks;

// Write updated settings
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('  - Hooks configured successfully');
"
}

# Step 5: Print browser extension instructions
print_extension_instructions() {
  echo "[5/5] Browser extension setup..."
  echo ""
  echo "==================================="
  echo "  MANUAL STEP REQUIRED"
  echo "==================================="
  echo ""
  echo "The browser extension needs to be loaded manually:"
  echo ""
  echo "For Chrome/Chromium/Brave:"
  echo "  1. Open chrome://extensions"
  echo "  2. Enable 'Developer mode' (toggle in top-right)"
  echo "  3. Click 'Load unpacked'"
  echo "  4. Select: $INSTALL_DIR/extension"
  echo ""
  echo "For Firefox:"
  echo "  1. Open about:debugging#/runtime/this-firefox"
  echo "  2. Click 'Load Temporary Add-on'"
  echo "  3. Select: $INSTALL_DIR/extension/manifest.firefox.json"
  echo "  Note: Firefox requires reloading after each restart"
  echo ""
  echo "==================================="
  echo "  INSTALLATION COMPLETE"
  echo "==================================="
  echo ""
  echo "The notification server will start automatically when"
  echo "Claude Code triggers a notification hook."
  echo ""
  echo "To verify everything works:"
  echo "  1. Load the browser extension (see above)"
  echo "  2. Start Claude Code"
  echo "  3. Interact until Claude needs input or finishes"
  echo "  4. You should see a browser notification!"
  echo ""
  echo "To uninstall, run:"
  echo "  $INSTALL_DIR/uninstall.sh"
  echo ""
}

# Main execution
main() {
  check_requirements
  clone_or_update_repo
  install_dependencies
  make_scripts_executable
  configure_claude_settings
  print_extension_instructions
}

main
