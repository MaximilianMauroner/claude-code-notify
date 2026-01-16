# Claude Code Browser Notification Extension

Get browser notifications when Claude Code (CLI) needs your input, permission approval, or has finished a task.

## Architecture

```
┌─────────────────┐     HTTP POST      ┌─────────────────┐     WebSocket     ┌─────────────────┐
│  Claude Code    │ ─────────────────► │  Local Server   │ ◄───────────────► │ Browser Extension│
│  (with hooks)   │                    │  (Node.js)      │                   │  (Chrome/Firefox)│
└─────────────────┘                    └─────────────────┘                   └─────────────────┘
```

1. **Claude Code Hooks** - Send HTTP requests when events occur
2. **Local WebSocket Server** - Receives hook events, broadcasts to browser
3. **Browser Extension** - Connects to server, shows notifications

## Quick Start

### 1. Install Server Dependencies

```bash
cd server
npm install
```

The server will **auto-start** when Claude Code launches (no need to run manually).

### 2. Load the Browser Extension

#### Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/` folder

#### Firefox

1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `extension/manifest.firefox.json`

### 3. Make Hook Scripts Executable

```bash
chmod +x hooks/notify.sh hooks/ensure-server.sh
```

### 4. Configure Claude Code Hooks

Add the hook configuration to your Claude Code settings. You have two options:

#### Option A: Set environment variable and merge config

Set the `CLAUDE_INPUT_DIR` environment variable to point to this repository:

```bash
export CLAUDE_INPUT_DIR="/path/to/claude-input"
```

Then add the hooks from `claude-hooks.json` to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "CLAUDE_HOOK_NAME=permission_prompt $CLAUDE_INPUT_DIR/hooks/notify.sh"
          }
        ]
      },
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "CLAUDE_HOOK_NAME=idle_prompt $CLAUDE_INPUT_DIR/hooks/notify.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "CLAUDE_HOOK_NAME=stop $CLAUDE_INPUT_DIR/hooks/notify.sh"
          }
        ]
      }
    ]
  }
}
```

#### Option B: Use absolute paths

Replace `$CLAUDE_INPUT_DIR` with the absolute path to this repository in your settings.

### 5. Verify Setup

1. Click the extension icon in your browser - it should show "Connected"
2. Test with curl:
   ```bash
   curl -X POST http://localhost:3099/notify \
     -H "Content-Type: application/json" \
     -d '{"type":"permission_prompt","message":"Test notification"}'
   ```
3. You should see a browser notification appear

## Notification Types

| Event | Title | Behavior |
|-------|-------|----------|
| `permission_prompt` | "Claude needs permission" | High priority, stays visible until clicked |
| `idle_prompt` | "Claude is waiting" | Normal priority, auto-dismisses |
| `stop` | "Claude finished" | Low priority, auto-dismisses |

## Extension Settings

Click the extension icon to access settings:

- **Enable notifications** - Toggle all notifications on/off
- **Sound for notifications** - Enable/disable notification sounds
- **Notify when Claude is idle** - Show notifications for idle prompts
- **Notify when Claude finishes** - Show notifications when tasks complete
- **Test Notification** - Send a test notification
- **Reconnect** - Manually reconnect to the server

## API Reference

### POST /notify

Send a notification to connected browser extensions.

**Request:**
```json
{
  "type": "permission_prompt" | "idle_prompt" | "stop",
  "message": "Description of what Claude needs"
}
```

**Response:**
```json
{
  "success": true,
  "clientsNotified": 1
}
```

### GET /health

Check server status.

**Response:**
```json
{
  "status": "ok",
  "connectedClients": 1,
  "uptime": 123.456
}
```

## Troubleshooting

### Extension shows "Disconnected"

1. The server should auto-start when Claude Code runs. Check if it's running:
   ```bash
   curl http://localhost:3099/health
   ```
2. If not running, start it manually: `cd server && npm start`
3. Check if port 3099 is available: `lsof -i :3099`
4. Click "Reconnect" in the extension popup

### No notifications appearing

1. Check browser notification permissions for the extension
2. Ensure "Enable notifications" is toggled on in the extension
3. Verify the server received the request (check server logs)

### Hooks not triggering

1. Verify Claude Code settings are configured correctly
2. Check that scripts are executable: `chmod +x hooks/notify.sh hooks/ensure-server.sh`
3. Test the hook manually: `echo '{}' | CLAUDE_HOOK_NAME=permission_prompt ./hooks/notify.sh`

### Manual Server Management

The server auto-starts when Claude Code launches. For manual control:

```bash
# Check server status
curl http://localhost:3099/health

# View server logs
tail -f /tmp/claude-notify-server.log

# Stop the server
kill $(cat /tmp/claude-notify-server.pid)

# Start server manually (for development)
cd server && npm start

# Check if multiple instances are running
pgrep -f "node.*index.js"
```

## Development

### Project Structure

```
claude-input/
├── server/
│   ├── package.json
│   └── index.js              # WebSocket + HTTP server
├── extension/
│   ├── manifest.json         # Chrome manifest (v3)
│   ├── manifest.firefox.json # Firefox manifest (v2)
│   ├── background.js         # Service worker
│   ├── popup.html            # Settings popup
│   ├── popup.js              # Popup logic
│   ├── popup.css             # Popup styles
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── hooks/
│   ├── notify.sh             # Hook script for notifications
│   └── ensure-server.sh      # Auto-starts server if not running
├── claude-hooks.json         # Hook configuration
└── README.md
```

### Running in Development

1. Start the server: `cd server && npm start`
2. Load the extension in developer mode
3. Make changes to extension files
4. Click "Reload" on the extension in `chrome://extensions` or `about:debugging`

## License

MIT
