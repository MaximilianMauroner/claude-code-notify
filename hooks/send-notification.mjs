// Reads one hook event from stdin and posts a notification.
// A PermissionRequest credit is recorded only after the server accepts the
// alert. Connection errors, timeouts, and non-2xx responses leave the count
// unchanged and fail the process.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activePermissions, notePermissionSent, planNotification } from './notifications.mjs';

const SEEN_PATH = '/tmp/claude-notify-permission-seen.json';
const LOCK_PATH = `${SEEN_PATH}.lock`;
const NOTIFY_URL = 'http://localhost:3099/notify';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withFileLock(lockPath, fn, options = {}) {
  const waitMs = options.waitMs ?? 10000;
  const staleMs = options.staleMs ?? 30000;
  const started = Date.now();

  for (;;) {
    let fd;
    try {
      fd = fs.openSync(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > staleMs) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch (statError) {
        if (statError.code !== 'ENOENT') throw statError;
        continue;
      }
      if (Date.now() - started > waitMs) {
        throw new Error('Timed out waiting for the permission dedupe lock');
      }
      await sleep(25);
      continue;
    }

    try {
      return await fn();
    } finally {
      fs.closeSync(fd);
      try {
        fs.unlinkSync(lockPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
}

function loadPending(seenPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(seenPath, 'utf8'));
    return parsed?.version === 3 ? activePermissions(parsed.expiries) : {};
  } catch {
    return {};
  }
}

function savePending(seenPath, pending) {
  const tmp = `${seenPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 3, expiries: pending }));
  fs.renameSync(tmp, seenPath);
}

export function postNotification(payload, options = {}) {
  const target = new URL(options.url || NOTIFY_URL);
  const body = JSON.stringify(payload);
  const timeout = options.timeoutMs ?? 5000;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout,
      },
      (res) => {
        res.resume();
        const ok = typeof res.statusCode === 'number' && res.statusCode >= 200 && res.statusCode < 300;
        res.on('end', () => finish(ok));
        res.on('error', () => finish(false));
      }
    );
    req.on('error', () => finish(false));
    req.on('timeout', () => {
      req.destroy();
      finish(false);
    });
    req.end(body);
  });
}

export async function deliverNotification(event, pending, post, clock = Date.now) {
  const plan = planNotification(event, pending, clock());
  if (plan.action === 'ignore') return { pending: plan.pending, status: 'ignored' };
  if (plan.action === 'drop') return { pending: plan.pending, status: 'dropped' };

  const ok = await post({
    type: plan.notification.type,
    title: plan.notification.title,
    message: plan.notification.message,
    timestamp: new Date().toISOString(),
  });
  if (!ok) return { pending: plan.pending, status: 'failed' };
  if (plan.action === 'send-permission') {
    return {
      pending: notePermissionSent(plan.pending, plan.sessionId, clock()),
      status: 'sent',
    };
  }
  return { pending: plan.pending, status: 'sent' };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const raw = (await readStdin()).trim();
  if (!raw) return 0;

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return 0;
  }

  return withFileLock(LOCK_PATH, async () => {
    const pending = loadPending(SEEN_PATH);
    const delivered = await deliverNotification(event, pending, (payload) => postNotification(payload));
    if (delivered.pending !== pending) savePending(SEEN_PATH, delivered.pending);
    if (delivered.status === 'failed') {
      console.error('claude-code-notify: notification server did not accept the alert');
      return 1;
    }
    return 0;
  });
}

// Node realpaths import.meta.url and leaves argv[1] as the path it was given.
// notify.sh uses logical pwd, so a symlinked ~/.claude makes those strings differ.
export function isSameModuleEntry(argvPath, modulePath) {
  if (!argvPath || !modulePath) return false;
  const fromArgv = path.resolve(argvPath);
  const fromModule = path.resolve(modulePath);
  if (fromArgv === fromModule) return true;
  try {
    return fs.realpathSync(fromArgv) === fs.realpathSync(fromModule);
  } catch {
    return false;
  }
}

function isDirectRun() {
  return isSameModuleEntry(process.argv[1], fileURLToPath(import.meta.url));
}

if (isDirectRun()) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
