// Maps a Claude Code hook event to a browser notification.
// Titles and default messages follow the Notification and PermissionRequest
// sections of https://code.claude.com/docs/en/hooks

// Documented Notification matchers. An unknown notification_type falls through
// to the generic copy so a future type is still delivered.
export const NOTIFICATION_COPY = {
  permission_prompt: {
    title: 'Claude needs permission',
    message: 'Claude Code needs your permission to proceed',
  },
  idle_prompt: {
    title: 'Claude is waiting',
    message: 'Claude Code is waiting for your input',
  },
  auth_success: {
    title: 'Claude signed in',
    message: 'Claude Code finished signing in',
  },
  auth_storage_failure: {
    title: "Claude couldn't save credentials",
    message: "Sign-in finished, but Claude Code couldn't save the new credentials",
  },
  elicitation_dialog: {
    title: 'Claude needs a form filled',
    message: 'An MCP server is waiting for you to fill in a form',
  },
  elicitation_url_dialog: {
    title: 'Claude needs you to open a link',
    message: 'An MCP server is waiting for you to open a browser link',
  },
  elicitation_complete: {
    title: 'Claude elicitation finished',
    message: 'An MCP server reported that a URL elicitation is complete',
  },
  elicitation_response: {
    title: 'Claude sent an elicitation response',
    message: 'An MCP elicitation response was sent back to the server',
  },
  agent_needs_input: {
    title: 'A background agent needs input',
    message: 'A background session is waiting for your input',
  },
  agent_completed: {
    title: 'A background agent finished',
    message: 'A background session finished or failed',
  },
  quota_auto_resume_fired: {
    title: 'Claude resumed after a usage limit',
    message: 'Claude Code continued your task after a usage limit',
  },
  quota_auto_resume_stale: {
    title: 'Claude is waiting after a usage limit',
    message: 'A usage limit reset while your computer was asleep. Press Enter to continue',
  },
  quota_auto_resume_disabled: {
    title: 'Claude stopped waiting on a usage limit',
    message: 'Claude Code ended its wait for a usage limit without continuing',
  },
  plugin_notification: {
    title: 'Claude plugin notification',
    message: 'A plugin raised a notification',
  },
};

const GENERIC_COPY = {
  title: 'Claude Code',
  message: 'Claude Code notification',
};

const STOP_COPY = {
  title: 'Claude finished',
  message: 'Claude Code has finished and is ready for your next instruction',
};

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function text(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function clip(value, max = 180) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function sessionIdOf(event) {
  return typeof event.session_id === 'string' ? event.session_id : '';
}

function pendingTable(pending) {
  if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return {};
  return pending;
}

// Outstanding PermissionRequest alerts that were actually delivered for a session.
export function permissionPendingCount(pending, sessionId) {
  const count = pendingTable(pending)[sessionId || ''];
  if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) return 0;
  return count;
}

export function notePermissionSent(pending, sessionId) {
  const key = sessionId || '';
  const next = { ...pendingTable(pending) };
  next[key] = permissionPendingCount(next, key) + 1;
  return next;
}

export function notePermissionPromptConsumed(pending, sessionId) {
  const key = sessionId || '';
  const count = permissionPendingCount(pending, key);
  const next = { ...pendingTable(pending) };
  if (count <= 1) delete next[key];
  else next[key] = count - 1;
  return next;
}

function permissionMessage(event) {
  const tool = text(event.tool_name) || 'a tool';
  const input = asObject(event.tool_input) || {};
  const detail =
    text(input.description) || text(input.command) || text(input.file_path) || text(input.prompt);
  if (detail) return clip(`${tool}: ${detail}`);
  return `Claude Code needs permission to use ${tool}`;
}

function notificationFromType(event, type) {
  const known = NOTIFICATION_COPY[type];
  const message = text(event.message);
  if (!known) {
    return {
      type,
      title: text(event.title) || GENERIC_COPY.title,
      message: message || GENERIC_COPY.message,
    };
  }

  // plugin_notification's title is the mod's name unless the mod set one.
  const title =
    type === 'plugin_notification' && text(event.title) ? text(event.title) : known.title;
  return {
    type,
    title,
    message: message || known.message,
  };
}

/**
 * @param {unknown} event Hook JSON from stdin.
 * @param {{ permissionPending?: Record<string, number> }} [options]
 * Counts are PermissionRequest alerts already delivered for each session.
 * A permission_prompt is dropped only while its session still has some of those.
 * @returns {{ type?: string, title?: string, message?: string, rememberPermission?: boolean, consumePermission?: boolean, sessionId?: string } | null}
 */
export function mapHookEvent(event, options = {}) {
  const body = asObject(event);
  if (!body) return null;

  const name = body.hook_event_name;

  if (name === 'PermissionRequest') {
    return {
      type: 'permission_prompt',
      title: NOTIFICATION_COPY.permission_prompt.title,
      message: permissionMessage(body),
      rememberPermission: true,
      sessionId: sessionIdOf(body),
    };
  }

  if (name === 'Notification') {
    const rawType = text(body.notification_type) || 'notification';
    const sessionId = sessionIdOf(body);
    if (rawType === 'permission_prompt' && permissionPendingCount(options.permissionPending, sessionId) > 0) {
      return { consumePermission: true, sessionId };
    }
    return notificationFromType(body, rawType);
  }

  if (name === 'Stop') {
    const last = text(body.last_assistant_message);
    return {
      type: 'stop',
      title: STOP_COPY.title,
      message: last ? clip(last) : STOP_COPY.message,
    };
  }

  return null;
}

/**
 * Applies a dropped permission_prompt to the pending counts.
 * Sending a PermissionRequest does not change the count here; that happens
 * only after the alert is delivered.
 * @param {unknown} event
 * @param {Record<string, number>} [pending]
 */
export function planNotification(event, pending = {}) {
  const mapped = mapHookEvent(event, { permissionPending: pending });
  if (!mapped) return { action: 'ignore', pending };
  if (mapped.consumePermission) {
    return {
      action: 'drop',
      pending: notePermissionPromptConsumed(pending, mapped.sessionId || ''),
      sessionId: mapped.sessionId || '',
    };
  }
  return {
    action: mapped.rememberPermission ? 'send-permission' : 'send',
    pending,
    sessionId: mapped.sessionId || '',
    notification: {
      type: mapped.type,
      title: mapped.title,
      message: mapped.message,
    },
  };
}
