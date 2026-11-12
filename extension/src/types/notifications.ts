export type NotificationTone = 'urgent' | 'attention' | 'complete';

export interface NotificationPresentation {
  title: string;
  label: string;
  tone: NotificationTone;
  priority: number;
  requireInteraction: boolean;
  iconUrl: string;
}

const ICON = 'icons/icon128.png';

export const NOTIFICATION_PRESENTATIONS: Record<string, NotificationPresentation> = {
  permission_prompt: {
    title: 'Claude needs permission',
    label: 'Permission Needed',
    tone: 'urgent',
    priority: 2,
    requireInteraction: true,
    iconUrl: ICON,
  },
  idle_prompt: {
    title: 'Claude is waiting',
    label: 'Waiting for Input',
    tone: 'attention',
    priority: 1,
    requireInteraction: false,
    iconUrl: ICON,
  },
  auth_success: {
    title: 'Claude signed in',
    label: 'Signed In',
    tone: 'complete',
    priority: 0,
    requireInteraction: false,
    iconUrl: ICON,
  },
  auth_storage_failure: {
    title: "Claude couldn't save credentials",
    label: 'Credential Save Failed',
    tone: 'urgent',
    priority: 2,
    requireInteraction: true,
    iconUrl: ICON,
  },
  elicitation_dialog: {
    title: 'Claude needs a form filled',
    label: 'Form Needed',
    tone: 'urgent',
    priority: 2,
    requireInteraction: true,
    iconUrl: ICON,
  },
  elicitation_url_dialog: {
    title: 'Claude needs you to open a link',
    label: 'Link Needed',
    tone: 'urgent',
    priority: 2,
    requireInteraction: true,
    iconUrl: ICON,
  },
  elicitation_complete: {
    title: 'Claude elicitation finished',
    label: 'Elicitation Complete',
    tone: 'attention',
    priority: 1,
    requireInteraction: false,
    iconUrl: ICON,
  },
  elicitation_response: {
    title: 'Claude sent an elicitation response',
    label: 'Elicitation Response',
    tone: 'attention',
    priority: 1,
    requireInteraction: false,
    iconUrl: ICON,
  },
  agent_needs_input: {
    title: 'A background agent needs input',
    label: 'Agent Needs Input',
    tone: 'urgent',
    priority: 2,
    requireInteraction: true,
    iconUrl: ICON,
  },
  agent_completed: {
    title: 'A background agent finished',
    label: 'Agent Finished',
    tone: 'complete',
    priority: 0,
    requireInteraction: false,
    iconUrl: ICON,
  },
  quota_auto_resume_fired: {
    title: 'Claude resumed after a usage limit',
    label: 'Resumed After Limit',
    tone: 'complete',
    priority: 0,
    requireInteraction: false,
    iconUrl: ICON,
  },
  quota_auto_resume_stale: {
    title: 'Claude is waiting after a usage limit',
    label: 'Usage Limit Reset',
    tone: 'urgent',
    priority: 2,
    requireInteraction: true,
    iconUrl: ICON,
  },
  quota_auto_resume_disabled: {
    title: 'Claude stopped waiting on a usage limit',
    label: 'Auto-Resume Stopped',
    tone: 'attention',
    priority: 1,
    requireInteraction: false,
    iconUrl: ICON,
  },
  plugin_notification: {
    title: 'Claude plugin notification',
    label: 'Plugin',
    tone: 'attention',
    priority: 1,
    requireInteraction: false,
    iconUrl: ICON,
  },
  stop: {
    title: 'Claude finished',
    label: 'Finished',
    tone: 'complete',
    priority: 0,
    requireInteraction: false,
    iconUrl: ICON,
  },
};

const GENERIC_PRESENTATION: NotificationPresentation = {
  title: 'Claude Code',
  label: 'Notification',
  tone: 'attention',
  priority: 1,
  requireInteraction: false,
  iconUrl: ICON,
};

function humanize(type: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(type) || type === 'notification') return 'Notification';
  return type
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function presentationFor(type: string): NotificationPresentation {
  const known = NOTIFICATION_PRESENTATIONS[type];
  if (known) return known;
  return { ...GENERIC_PRESENTATION, label: humanize(type) };
}

export interface StoredNotification {
  type: string;
  title?: string;
  message?: string;
  timestamp?: string;
  receivedAt: string;
}

export interface IncomingNotification {
  type: string;
  title?: string;
  message?: string;
  timestamp?: string;
}
