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
4. Configures Claude Code hooks in `~/.claude/settings.json`. Re-running replaces this installer's hooks and leaves every other hook in place.

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
node -p 'process.execPath' > ~/.claude/claude-code-notify/hooks/node-path
```

The hook runs that recorded binary. Claude Code does not put `node` on the hook `PATH`.

### 4. Configure Claude Code Hooks

Add the following to your `~/.claude/settings.json` (create it if it doesn't exist). The installer writes the same fields with the script path quoted absolutely.

`PermissionRequest` fires when Claude asks to use a tool. `matcher` `""` matches every tool. The hook is `async`, so it does not block the prompt, and it prints no decision, so it never allows or denies. `onFailure` is `continue`, so a failed hook does not deny the request. `timeout` is seconds. Claude Code does not enforce it while `async` is true.

`Notification` uses the same empty matcher, which matches every notification type, including types added later. `Stop` has no matcher: that event does not support one.

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "\"$HOME/.claude/claude-code-notify/hooks/notify.sh\"",
            "timeout": 15,
            "async": true,
            "onFailure": "continue"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "\"$HOME/.claude/claude-code-notify/hooks/notify.sh\"",
            "timeout": 15,
            "async": true,
            "onFailure": "continue"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$HOME/.claude/claude-code-notify/hooks/notify.sh\"",
            "timeout": 15,
            "async": true,
            "onFailure": "continue"
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

Permission alerts come from `PermissionRequest`, which runs when Claude asks to use a tool. The credit for that alert is stored only after the notification server accepts it. Each delivered `PermissionRequest` then consumes one following `permission_prompt` for the same session within 15 seconds. Unused credits expire after 15 seconds and are cleared when `Stop` ends the turn. A `permission_prompt` with no remaining credit, including a sandboxed command's network request, is still delivered.

Every other `Notification` type is delivered. A type this version does not know about still shows a generic "Claude Code" notification. When Claude includes a message, that text is shown instead of the default.

| Source | Title | Default message | Behavior |
|--------|-------|-----------------|----------|
| `PermissionRequest` | Claude needs permission | Tool name and command, description, or path | Stays visible until clicked |
| `permission_prompt` | Claude needs permission | Claude Code needs your permission to proceed | Stays visible until clicked |
| `idle_prompt` | Claude is waiting | Claude Code is waiting for your input | Auto-dismisses |
| `auth_success` | Claude signed in | Claude Code finished signing in | Auto-dismisses |
| `auth_storage_failure` | Claude couldn't save credentials | Sign-in finished, but Claude Code couldn't save the new credentials | Stays visible until clicked |
| `elicitation_dialog` | Claude needs a form filled | An MCP server is waiting for you to fill in a form | Stays visible until clicked |
| `elicitation_url_dialog` | Claude needs you to open a link | An MCP server is waiting for you to open a browser link | Stays visible until clicked |
| `elicitation_complete` | Claude elicitation finished | An MCP server reported that a URL elicitation is complete | Auto-dismisses |
| `elicitation_response` | Claude sent an elicitation response | An MCP elicitation response was sent back to the server | Auto-dismisses |
| `agent_needs_input` | A background agent needs input | A background session is waiting for your input | Stays visible until clicked |
| `agent_completed` | A background agent finished | A background session finished or failed | Auto-dismisses |
| `quota_auto_resume_fired` | Claude resumed after a usage limit | Claude Code continued your task after a usage limit | Auto-dismisses |
| `quota_auto_resume_stale` | Claude is waiting after a usage limit | A usage limit reset while your computer was asleep. Press Enter to continue | Stays visible until clicked |
| `quota_auto_resume_disabled` | Claude stopped waiting on a usage limit | Claude Code ended its wait for a usage limit without continuing | Auto-dismisses |
| `plugin_notification` | Plugin name, or "Claude plugin notification" | A plugin raised a notification | Auto-dismisses |
| `Stop` | Claude finished | Claude Code has finished and is ready for your next instruction | Auto-dismisses. Uses Claude's last message when one is sent |
| Any other notification type | Claude's title, or "Claude Code" | Claude's message, or "Claude Code notification" | Auto-dismisses |

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
`type` is the notification kind. Documented kinds are listed above. Any other non-empty `type` is delivered as a generic notification.

```json
{
  "type": "permission_prompt",
  "title": "Claude needs permission",
  "message": "Bash: Remove node_modules directory"
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
2. Check that scripts are executable and the node binary is recorded: `chmod +x hooks/notify.sh hooks/ensure-server.sh && node -p 'process.execPath' > hooks/node-path`
3. Test the hook manually: `echo '{"hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":"ls"}}' | ./hooks/notify.sh`

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
│   ├── notify.sh             # Hook entrypoint; runs the recorded node binary
│   ├── send-notification.mjs # Reads hook JSON and posts /notify
│   ├── notifications.mjs     # Event to title and message
│   ├── claude-settings.mjs   # Idempotent settings install and removal
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
