# Claude Code Browser Notification Extension

Get browser notifications when Claude Code (CLI) needs your input, permission approval, or has finished a task.

## Installation

### Quick Install (Recommended)

Run this one-liner to automatically set up everything:

```bash
curl -fsSL https://raw.githubusercontent.com/MaximilianMauroner/claude-code-notify/main/install.sh | bash
```

**What this does:**
1. Clones the repository to `~/.claude/claude-code-notify`
2. Builds the notification server
3. Makes hook scripts executable
4. Configures Claude Code hooks in `~/.claude/settings.json`

**Requirements:** git, node, npm

### Install the Browser Extension

Install the extension from your browser's store:

#### Chrome / Chromium / Brave

Install from the [Chrome Web Store](https://chromewebstore.google.com/) (search for "Claude Code Notify")

#### Firefox

Install from [Firefox Add-ons](https://addons.mozilla.org/) (search for "Claude Code Notify")

### Verify Installation

1. Click the extension icon in your browser - it should show "Connected"
2. Start Claude Code and interact until it needs input or finishes a task
3. You should see a browser notification

### Uninstall

To remove the extension completely:

```bash
~/.claude/claude-code-notify/uninstall.sh
```

This removes the hooks from settings, stops the server, and deletes the installation directory. You'll need to manually remove the browser extension.

---

## Manual Installation

If you prefer to set things up manually or want to understand what the install script does:

### 1. Clone the Repository

```bash
git clone https://github.com/MaximilianMauroner/claude-code-notify.git ~/.claude/claude-code-notify
```

### 2. Build the Server

```bash
cd ~/.claude/claude-code-notify/server
npm install
npm run build
```

### 3. Make Scripts Executable

```bash
chmod +x ~/.claude/claude-code-notify/hooks/notify.sh
chmod +x ~/.claude/claude-code-notify/hooks/ensure-server.sh
```

### 4. Configure Claude Code Hooks

Add the following to your `~/.claude/settings.json` (create it if it doesn't exist):

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "CLAUDE_HOOK_NAME=permission_prompt ~/.claude/claude-code-notify/hooks/notify.sh"
          }
        ]
      },
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "CLAUDE_HOOK_NAME=idle_prompt ~/.claude/claude-code-notify/hooks/notify.sh"
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
            "command": "CLAUDE_HOOK_NAME=stop ~/.claude/claude-code-notify/hooks/notify.sh"
          }
        ]
      }
    ]
  }
}
```

### 5. Install the Browser Extension

Install from the [Chrome Web Store](https://chromewebstore.google.com/) or [Firefox Add-ons](https://addons.mozilla.org/) (search for "Claude Code Notify").

---

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
claude-code-notify/
├── server/
│   ├── package.json
│   ├── src/
│   │   └── index.ts          # WebSocket + HTTP server
│   └── dist/                 # Compiled output
├── extension/
│   ├── manifest.json         # Chrome manifest (v3)
│   ├── manifest.firefox.json # Firefox manifest (v2)
│   ├── src/
│   │   ├── background.ts     # Service worker
│   │   └── popup.ts          # Popup logic
│   ├── popup.html            # Settings popup
│   ├── popup.css             # Popup styles
│   ├── dist/                 # Compiled output
│   └── icons/
├── hooks/
│   ├── notify.sh             # Hook script for notifications
│   └── ensure-server.sh      # Auto-starts server if not running
└── README.md
```

### Running in Development

1. Build and start the server: `cd server && npm install && npm run build && npm start`
2. Build the extension: `cd extension && npm install && npm run build`
3. Load the extension in developer mode:
   - **Chrome**: Go to `chrome://extensions`, enable "Developer mode", click "Load unpacked", select the `extension` folder
   - **Firefox**: Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", select `extension/manifest.firefox.json`
4. Make changes to extension files and run `npm run build` in the extension folder
5. Click "Reload" on the extension in `chrome://extensions` or `about:debugging`

## License

MIT
