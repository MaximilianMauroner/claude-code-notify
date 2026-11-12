// Maps a Claude Code hook event to a browser notification.
// Titles and default messages follow the Notification and PermissionRequest
// sections of https://code.claude.com/docs/en/hooks

export const PERMISSION_PROMPT_DEDUPE_MS = 15000;

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

function recentlySawPermission(seen, sessionId, now) {
  if (!seen || typeof seen !== 'object') return false;
  const at = seen[sessionId];
  if (typeof at !== 'number' || !Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age < PERMISSION_PROMPT_DEDUPE_MS;
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
 * @param {{ now?: number, permissionSeen?: Record<string, number> }} [options]
 * @returns {{ type: string, title: string, message: string, rememberPermission?: boolean, sessionId?: string } | null}
 */
export function mapHookEvent(event, options = {}) {
  const body = asObject(event);
  if (!body) return null;

  const now = typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();
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
    if (
      rawType === 'permission_prompt' &&
      recentlySawPermission(options.permissionSeen, sessionIdOf(body), now)
    ) {
      return null;
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
