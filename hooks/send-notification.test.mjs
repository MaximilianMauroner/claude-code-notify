import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deliverNotification, postNotification, withFileLock } from './send-notification.mjs';

const permissionRequest = {
  hook_event_name: 'PermissionRequest',
  session_id: 'abc',
  tool_name: 'Bash',
  tool_input: { command: 'ls' },
};

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/notify`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test('a failed delivery does not record a PermissionRequest credit', async () => {
  const posts = [];
  const result = await deliverNotification(permissionRequest, {}, async (payload) => {
    posts.push(payload);
    return false;
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.pending, {});
  assert.equal(posts.length, 1);
});

test('a delivered PermissionRequest records one credit, and only that many prompts are dropped', async () => {
  let pending = {};
  const first = await deliverNotification(permissionRequest, pending, async () => true);
  assert.equal(first.status, 'sent');
  pending = first.pending;
  assert.equal(pending.abc, 1);

  const second = await deliverNotification(permissionRequest, pending, async () => true);
  pending = second.pending;
  assert.equal(pending.abc, 2);

  const prompt = {
    hook_event_name: 'Notification',
    notification_type: 'permission_prompt',
    session_id: 'abc',
  };
  const dropped = await deliverNotification(prompt, pending, async () => {
    throw new Error('dropped prompts are not posted');
  });
  assert.equal(dropped.status, 'dropped');
  pending = dropped.pending;
  assert.equal(pending.abc, 1);

  const droppedAgain = await deliverNotification(prompt, pending, async () => true);
  pending = droppedAgain.pending;
  assert.equal(pending.abc, undefined);

  const delivered = await deliverNotification(prompt, pending, async () => true);
  assert.equal(delivered.status, 'sent');
  assert.equal(delivered.pending.abc, undefined);
});

test('postNotification accepts only 2xx and treats errors and timeouts as failure', async () => {
  const okServer = await listen((_req, res) => {
    res.writeHead(204);
    res.end();
  });
  const badServer = await listen((_req, res) => {
    res.writeHead(500);
    res.end('no');
  });
  const hangServer = await listen(() => {});
  try {
    assert.equal(await postNotification({ type: 'stop', title: 't', message: 'm' }, { url: okServer.url }), true);
    assert.equal(
      await postNotification({ type: 'stop', title: 't', message: 'm' }, { url: badServer.url }),
      false
    );
    assert.equal(
      await postNotification(
        { type: 'stop', title: 't', message: 'm' },
        { url: hangServer.url, timeoutMs: 50 }
      ),
      false
    );
    assert.equal(
      await postNotification(
        { type: 'stop', title: 't', message: 'm' },
        { url: 'http://127.0.0.1:1/notify', timeoutMs: 200 }
      ),
      false
    );
  } finally {
    await okServer.close();
    await badServer.close();
    await hangServer.close();
  }
});

test('the dedupe lock is exclusive across overlapping updates', async () => {
  const lockPath = path.join(os.tmpdir(), `claude-notify-lock-${process.pid}-${Date.now()}`);
  let active = 0;
  let maxActive = 0;
  await Promise.all(
    [0, 1, 2].map(() =>
      withFileLock(lockPath, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 40));
        active -= 1;
      })
    )
  );
  assert.equal(maxActive, 1);
  assert.equal(fs.existsSync(lockPath), false);
});
