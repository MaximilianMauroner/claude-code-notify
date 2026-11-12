import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateSettings, removeNotifyHooks } from './claude-settings.mjs';

const INSTALL_DIR = '/tmp/claude code notify/claude-code-notify';
const SCRIPT = `${INSTALL_DIR}/hooks/notify.sh`;
const QUOTED_SCRIPT = `'${SCRIPT}'`;

function oldInstall() {
  return {
    model: 'opus',
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: '/tmp/lint.sh' }],
        },
      ],
      Notification: [
        {
          matcher: 'permission_prompt',
          hooks: [
            {
              type: 'command',
              command: `CLAUDE_HOOK_NAME=permission_prompt ${SCRIPT}`,
            },
          ],
        },
        {
          matcher: 'idle_prompt',
          hooks: [
            { type: 'command', command: `CLAUDE_HOOK_NAME=idle_prompt ${SCRIPT}` },
            { type: 'command', command: '/usr/bin/say-idle' },
          ],
        },
        {
          matcher: 'auth_success',
          hooks: [{ type: 'command', command: '/usr/bin/other-hook' }],
        },
      ],
      Stop: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: `CLAUDE_HOOK_NAME=stop ${SCRIPT}` }],
        },
      ],
    },
  };
}

function ourHandlers(settings) {
  const found = [];
  for (const event of ['PermissionRequest', 'Notification', 'Stop']) {
    for (const group of settings.hooks?.[event] ?? []) {
      for (const hook of group.hooks ?? []) {
        if (String(hook.command).includes('claude-code-notify/hooks/notify.sh')) {
          found.push({ event, group, hook });
        }
      }
    }
  }
  return found;
}

test('migrating an old install is idempotent and preserves other hooks', () => {
  const once = migrateSettings(oldInstall(), INSTALL_DIR);
  const twice = migrateSettings(once, INSTALL_DIR);
  assert.deepEqual(twice, once);

  assert.equal(once.model, 'opus');
  assert.deepEqual(once.hooks.PreToolUse, oldInstall().hooks.PreToolUse);

  const ours = ourHandlers(once);
  assert.equal(ours.length, 3);
  assert.deepEqual(
    ours.map((entry) => entry.event),
    ['PermissionRequest', 'Notification', 'Stop']
  );

  for (const entry of ours) {
    assert.deepEqual(entry.hook, {
      type: 'command',
      command: QUOTED_SCRIPT,
      timeout: 15,
      async: true,
      onFailure: 'continue',
    });
  }

  const permission = once.hooks.PermissionRequest;
  assert.equal(permission.length, 1);
  assert.equal(permission[0].matcher, '');

  const notificationMatchers = once.hooks.Notification.map((group) => group.matcher);
  assert.deepEqual(notificationMatchers, ['idle_prompt', 'auth_success', '']);
  assert.deepEqual(once.hooks.Notification[0].hooks, [{ type: 'command', command: '/usr/bin/say-idle' }]);
  assert.deepEqual(once.hooks.Notification[1].hooks, [
    { type: 'command', command: '/usr/bin/other-hook' },
  ]);

  assert.equal(once.hooks.Stop.length, 1);
  assert.equal(Object.hasOwn(once.hooks.Stop[0], 'matcher'), false);

  for (const groups of Object.values(once.hooks)) {
    for (const group of groups) {
      assert.ok(group.hooks.length > 0);
    }
  }
});

test('migrating twice from a fresh file leaves a single copy of each hook', () => {
  const once = migrateSettings({}, INSTALL_DIR);
  const twice = migrateSettings(once, INSTALL_DIR);
  assert.deepEqual(twice, once);
  assert.equal(ourHandlers(twice).length, 3);
  assert.equal(twice.hooks.PermissionRequest.length, 1);
  assert.equal(twice.hooks.Notification.length, 1);
  assert.equal(twice.hooks.Stop.length, 1);
});

test('migration stays idempotent for an install path outside the default directory', () => {
  const dir = '/opt/notify-tool';
  const once = migrateSettings({ theme: 'dark' }, dir);
  const twice = migrateSettings(once, dir);
  assert.deepEqual(twice, once);

  const script = `'${dir}/hooks/notify.sh'`;
  for (const event of ['PermissionRequest', 'Notification', 'Stop']) {
    const commands = once.hooks[event].flatMap((group) => group.hooks.map((hook) => hook.command));
    assert.deepEqual(commands, [script]);
  }

  const removed = removeNotifyHooks(once, dir);
  assert.equal(removed.modified, true);
  assert.equal(removed.settings.hooks, undefined);
  assert.equal(removed.settings.theme, 'dark');

  const again = removeNotifyHooks(removed.settings, dir);
  assert.equal(again.modified, false);
  assert.deepEqual(again.settings, removed.settings);
});

test('removing notifier hooks is idempotent and leaves other hooks in place', () => {
  const migrated = migrateSettings(oldInstall(), INSTALL_DIR);
  const first = removeNotifyHooks(migrated);
  assert.equal(first.modified, true);
  assert.equal(ourHandlers(first.settings).length, 0);
  assert.equal(first.settings.hooks.PermissionRequest, undefined);
  assert.equal(first.settings.hooks.Stop, undefined);
  assert.deepEqual(first.settings.hooks.PreToolUse, oldInstall().hooks.PreToolUse);
  assert.deepEqual(
    first.settings.hooks.Notification.map((group) => group.matcher),
    ['idle_prompt', 'auth_success']
  );

  const second = removeNotifyHooks(first.settings);
  assert.equal(second.modified, false);
  assert.deepEqual(second.settings, first.settings);
});
