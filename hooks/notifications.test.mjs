import assert from 'node:assert/strict';
import test from 'node:test';
import { NOTIFICATION_COPY, PERMISSION_PROMPT_DEDUPE_MS, mapHookEvent } from './notifications.mjs';

const DOCUMENTED = [
  ['permission_prompt', 'Claude needs permission', 'Claude Code needs your permission to proceed'],
  ['idle_prompt', 'Claude is waiting', 'Claude Code is waiting for your input'],
  ['auth_success', 'Claude signed in', 'Claude Code finished signing in'],
  [
    'auth_storage_failure',
    "Claude couldn't save credentials",
    "Sign-in finished, but Claude Code couldn't save the new credentials",
  ],
  ['elicitation_dialog', 'Claude needs a form filled', 'An MCP server is waiting for you to fill in a form'],
  [
    'elicitation_url_dialog',
    'Claude needs you to open a link',
    'An MCP server is waiting for you to open a browser link',
  ],
  [
    'elicitation_complete',
    'Claude elicitation finished',
    'An MCP server reported that a URL elicitation is complete',
  ],
  [
    'elicitation_response',
    'Claude sent an elicitation response',
    'An MCP elicitation response was sent back to the server',
  ],
  ['agent_needs_input', 'A background agent needs input', 'A background session is waiting for your input'],
  ['agent_completed', 'A background agent finished', 'A background session finished or failed'],
  [
    'quota_auto_resume_fired',
    'Claude resumed after a usage limit',
    'Claude Code continued your task after a usage limit',
  ],
  [
    'quota_auto_resume_stale',
    'Claude is waiting after a usage limit',
    'A usage limit reset while your computer was asleep. Press Enter to continue',
  ],
  [
    'quota_auto_resume_disabled',
    'Claude stopped waiting on a usage limit',
    'Claude Code ended its wait for a usage limit without continuing',
  ],
  ['plugin_notification', 'Claude plugin notification', 'A plugin raised a notification'],
];

function alertOf(result) {
  assert.ok(result);
  return { type: result.type, title: result.title, message: result.message };
}

test('documented notification types match the copy table', () => {
  assert.deepEqual(
    Object.keys(NOTIFICATION_COPY).sort(),
    DOCUMENTED.map(([type]) => type).sort()
  );
});

test('each documented notification type has a title and a default message', () => {
  for (const [type, title, message] of DOCUMENTED) {
    assert.deepEqual(
      alertOf(mapHookEvent({ hook_event_name: 'Notification', notification_type: type })),
      { type, title, message }
    );
  }
});

test('a documented notification keeps its title and uses Claude\'s message', () => {
  const result = mapHookEvent({
    hook_event_name: 'Notification',
    notification_type: 'permission_prompt',
    title: 'Permission needed',
    message: 'Claude needs your permission',
  });
  assert.deepEqual(alertOf(result), {
    type: 'permission_prompt',
    title: 'Claude needs permission',
    message: 'Claude needs your permission',
  });
});

test('plugin notifications use the hook title when one is set', () => {
  const result = mapHookEvent({
    hook_event_name: 'Notification',
    notification_type: 'plugin_notification',
    title: 'Deploy bot',
    message: 'Build finished',
  });
  assert.deepEqual(alertOf(result), {
    type: 'plugin_notification',
    title: 'Deploy bot',
    message: 'Build finished',
  });
});

test('unknown notification types are delivered with a generic fallback', () => {
  assert.deepEqual(
    alertOf(
      mapHookEvent({
        hook_event_name: 'Notification',
        notification_type: 'future_kind',
        title: 'From Claude',
        message: 'Hello',
      })
    ),
    { type: 'future_kind', title: 'From Claude', message: 'Hello' }
  );

  assert.deepEqual(
    alertOf(mapHookEvent({ hook_event_name: 'Notification', notification_type: 'future_kind' })),
    { type: 'future_kind', title: 'Claude Code', message: 'Claude Code notification' }
  );

  assert.deepEqual(alertOf(mapHookEvent({ hook_event_name: 'Notification' })), {
    type: 'notification',
    title: 'Claude Code',
    message: 'Claude Code notification',
  });
});

test('PermissionRequest notifies immediately with the tool detail and does not decide', () => {
  const result = mapHookEvent({
    hook_event_name: 'PermissionRequest',
    session_id: 'abc',
    tool_name: 'Bash',
    tool_input: {
      command: 'rm -rf node_modules',
      description: 'Remove node_modules directory',
    },
  });
  assert.deepEqual(alertOf(result), {
    type: 'permission_prompt',
    title: 'Claude needs permission',
    message: 'Bash: Remove node_modules directory',
  });
  assert.equal(result.rememberPermission, true);
  assert.equal(result.sessionId, 'abc');
  assert.equal('decision' in result, false);
  assert.equal('behavior' in result, false);
});

test('PermissionRequest without a tool detail names the tool', () => {
  assert.equal(
    mapHookEvent({ hook_event_name: 'PermissionRequest', tool_name: 'Edit' }).message,
    'Claude Code needs permission to use Edit'
  );
});

test('a late permission_prompt for the same session is skipped inside the dedupe window', () => {
  const seen = { abc: 10_000 };
  const now = 10_000 + PERMISSION_PROMPT_DEDUPE_MS - 1;
  assert.equal(
    mapHookEvent(
      { hook_event_name: 'Notification', notification_type: 'permission_prompt', session_id: 'abc' },
      { now, permissionSeen: seen }
    ),
    null
  );
});

test('permission_prompt still fires for another session or after the window', () => {
  const seen = { abc: 10_000 };
  const other = mapHookEvent(
    { hook_event_name: 'Notification', notification_type: 'permission_prompt', session_id: 'other' },
    { now: 12_000, permissionSeen: seen }
  );
  assert.equal(other.type, 'permission_prompt');

  const later = mapHookEvent(
    { hook_event_name: 'Notification', notification_type: 'permission_prompt', session_id: 'abc' },
    { now: 10_000 + PERMISSION_PROMPT_DEDUPE_MS, permissionSeen: seen }
  );
  assert.equal(later.type, 'permission_prompt');
});

test('other notification types are not suppressed by a recent permission request', () => {
  const result = mapHookEvent(
    { hook_event_name: 'Notification', notification_type: 'idle_prompt', session_id: 'abc' },
    { now: 12_000, permissionSeen: { abc: 10_000 } }
  );
  assert.equal(result.type, 'idle_prompt');
  assert.equal(result.title, 'Claude is waiting');
});

test('Stop uses the last assistant message when Claude sends one', () => {
  assert.deepEqual(
    alertOf(
      mapHookEvent({
        hook_event_name: 'Stop',
        last_assistant_message: 'I finished the refactor.',
      })
    ),
    {
      type: 'stop',
      title: 'Claude finished',
      message: 'I finished the refactor.',
    }
  );

  assert.equal(
    mapHookEvent({ hook_event_name: 'Stop' }).message,
    'Claude Code has finished and is ready for your next instruction'
  );
});

test('events this notifier does not handle produce no notification', () => {
  assert.equal(mapHookEvent({ hook_event_name: 'PreToolUse', tool_name: 'Bash' }), null);
  assert.equal(mapHookEvent(null), null);
  assert.equal(mapHookEvent('permission_prompt'), null);
});
