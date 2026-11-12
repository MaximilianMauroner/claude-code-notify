// Reads one hook event from stdin and posts a notification.
// Prints nothing and always exits 0, so a PermissionRequest hook cannot
// allow, deny, or block the prompt.

import fs from 'node:fs';
import http from 'node:http';
import { mapHookEvent, PERMISSION_PROMPT_DEDUPE_MS } from './notifications.mjs';

const SEEN_PATH = '/tmp/claude-notify-permission-seen.json';
const NOTIFY_URL = new URL('http://localhost:3099/notify');

function loadSeen() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveSeen(seen, now) {
  for (const [key, at] of Object.entries(seen)) {
    if (typeof at !== 'number' || now - at > PERMISSION_PROMPT_DEDUPE_MS) {
      delete seen[key];
    }
  }
  const tmp = `${SEEN_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(seen));
  fs.renameSync(tmp, SEEN_PATH);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function postNotification(payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: NOTIFY_URL.hostname,
        port: NOTIFY_URL.port,
        path: NOTIFY_URL.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 5000,
      },
      (res) => {
        res.resume();
        res.on('end', resolve);
      }
    );
    req.on('error', resolve);
    req.on('timeout', () => {
      req.destroy();
      resolve();
    });
    req.end(body);
  });
}

async function main() {
  const raw = (await readStdin()).trim();
  if (!raw) return;

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }

  const now = Date.now();
  const seen = loadSeen();
  const mapped = mapHookEvent(event, { now, permissionSeen: seen });
  if (!mapped) return;

  if (mapped.rememberPermission) {
    seen[mapped.sessionId || ''] = now;
    try {
      saveSeen(seen, now);
    } catch {
      // A missed dedupe write must not stop the alert.
    }
  }

  await postNotification({
    type: mapped.type,
    title: mapped.title,
    message: mapped.message,
    timestamp: new Date(now).toISOString(),
  });
}

main()
  .catch(() => {})
  .finally(() => {
    process.exit(0);
  });
