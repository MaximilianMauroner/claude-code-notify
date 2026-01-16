import browser from 'webextension-polyfill';
import type {
  NotificationType,
  NotificationConfig,
  NotificationConfigMap,
  StoredNotification,
  IncomingNotification,
  Settings,
  RuntimeMessage,
  StatusResponse,
  SuccessResponse,
  ConnectionStatus,
  BadgeStatus,
} from './types';
import { DEFAULT_SETTINGS } from './types';

// Configuration
const WS_URL = 'ws://localhost:3099';
const RECONNECT_INITIAL_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const KEEPALIVE_INTERVAL = 20000;
const MAX_RECENT_NOTIFICATIONS = 10;

// State
let ws: WebSocket | null = null;
let reconnectDelay = RECONNECT_INITIAL_DELAY;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
let isConnected = false;
let recentNotifications: StoredNotification[] = [];
let unreadCount = 0;
let lastNotificationType: NotificationType | null = null;

// Notification configuration
const NOTIFICATION_CONFIG: NotificationConfigMap = {
  permission_prompt: {
    title: 'Claude needs permission',
    iconUrl: 'icons/icon128.png',
    priority: 2,
    requireInteraction: true,
  },
  idle_prompt: {
    title: 'Claude is waiting',
    iconUrl: 'icons/icon128.png',
    priority: 1,
    requireInteraction: false,
  },
  stop: {
    title: 'Claude finished',
    iconUrl: 'icons/icon128.png',
    priority: 0,
    requireInteraction: false,
  },
};

// Badge colors for different states
const BADGE_COLORS: Record<BadgeStatus, string> = {
  // Connection states
  connected: '#22c55e', // Green
  disconnected: '#6b7280', // Gray
  error: '#ef4444', // Red
  // Notification types
  permission_prompt: '#ef4444', // Red - urgent
  idle_prompt: '#f97316', // Orange - attention needed
  stop: '#22c55e', // Green - complete
};

// Initialize connection
function connect(): void {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = (): void => {
      console.log('[Claude Notifier] Connected to server');
      isConnected = true;
      reconnectDelay = RECONNECT_INITIAL_DELAY;
      updateBadge('connected');
      startKeepalive();
      saveState();
    };

    ws.onmessage = async (event: MessageEvent): Promise<void> => {
      try {
        const data = JSON.parse(event.data as string) as IncomingNotification;

        if (data.type === 'connected' || data.type === 'pong') {
          return;
        }

        // Store notification in recent list
        addRecentNotification(data as StoredNotification);

        // Check if notifications are enabled
        const settings = await getSettings();
        if (!settings.notificationsEnabled) {
          return;
        }

        // Show browser notification
        await showNotification(data);
      } catch (error) {
        console.error('[Claude Notifier] Error processing message:', error);
      }
    };

    ws.onclose = (): void => {
      console.log('[Claude Notifier] Disconnected from server');
      isConnected = false;
      updateBadge('disconnected');
      stopKeepalive();
      saveState();
      scheduleReconnect();
    };

    ws.onerror = (error: Event): void => {
      console.error('[Claude Notifier] WebSocket error:', error);
      isConnected = false;
      updateBadge('error');
    };
  } catch (error) {
    console.error('[Claude Notifier] Connection error:', error);
    scheduleReconnect();
  }
}

// Reconnection with exponential backoff
function scheduleReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  console.log(`[Claude Notifier] Reconnecting in ${reconnectDelay}ms...`);

  reconnectTimeout = setTimeout(() => {
    connect();
  }, reconnectDelay);

  // Exponential backoff
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY);
}

// Keepalive for Chrome service worker
function startKeepalive(): void {
  stopKeepalive();
  keepaliveInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, KEEPALIVE_INTERVAL);
}

function stopKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

// Badge updates for connection status
function updateBadge(status: ConnectionStatus): void {
  // If we have unread notifications, show those instead of connection status
  if (unreadCount > 0 && status === 'connected') {
    updateNotificationBadge();
    return;
  }

  const texts: Record<ConnectionStatus, string> = {
    connected: '',
    disconnected: '!',
    error: 'X',
  };

  setBadge(texts[status], BADGE_COLORS[status]);
}

// Update badge for notifications
function updateNotificationBadge(): void {
  if (unreadCount === 0) {
    // Clear badge, show connected state
    setBadge('', BADGE_COLORS.connected);
    lastNotificationType = null;
  } else {
    // Show count with color based on most recent notification type
    const color = lastNotificationType
      ? BADGE_COLORS[lastNotificationType]
      : BADGE_COLORS.permission_prompt;
    const text = unreadCount > 9 ? '9+' : unreadCount.toString();
    setBadge(text, color);
  }
}

// Helper to set badge
function setBadge(text: string, color: string): void {
  browser.action.setBadgeBackgroundColor({ color });
  browser.action.setBadgeText({ text });
}

// Clear unread count (called when popup opens or user acknowledges)
function clearUnreadCount(): void {
  unreadCount = 0;
  lastNotificationType = null;
  updateNotificationBadge();
  saveState();
}

// Show notification
async function showNotification(data: IncomingNotification): Promise<void> {
  if (data.type === 'connected' || data.type === 'pong') return;

  const config: NotificationConfig = NOTIFICATION_CONFIG[data.type];
  if (!config) return;

  const settings = await getSettings();

  // Check notification type settings
  if (data.type === 'stop' && !settings.notifyOnStop) return;
  if (data.type === 'idle_prompt' && !settings.notifyOnIdle) return;

  const notificationId = `claude-${Date.now()}`;

  const options: browser.Notifications.CreateNotificationOptions = {
    type: 'basic',
    iconUrl: config.iconUrl,
    title: config.title,
    message: data.message || 'Claude Code requires your attention',
  };

  await browser.notifications.create(notificationId, options);

  // Auto-close non-interactive notifications after 5 seconds
  if (!config.requireInteraction) {
    setTimeout(() => {
      browser.notifications.clear(notificationId);
    }, 5000);
  }
}

// Settings management
async function getSettings(): Promise<Settings> {
  try {
    const result = await browser.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...(result.settings as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Recent notifications management
function addRecentNotification(notification: IncomingNotification): void {
  if (notification.type === 'connected' || notification.type === 'pong') return;

  const stored: StoredNotification = {
    type: notification.type,
    message: notification.message,
    timestamp: notification.timestamp,
    receivedAt: new Date().toISOString(),
  };

  recentNotifications.unshift(stored);

  if (recentNotifications.length > MAX_RECENT_NOTIFICATIONS) {
    recentNotifications.pop();
  }

  // Update unread count and badge
  unreadCount++;
  lastNotificationType = notification.type;
  updateNotificationBadge();

  saveState();
}

async function saveState(): Promise<void> {
  await browser.storage.local.set({
    isConnected,
    recentNotifications,
    unreadCount,
    lastNotificationType,
  });
}

async function loadState(): Promise<void> {
  try {
    const result = await browser.storage.local.get([
      'recentNotifications',
      'unreadCount',
      'lastNotificationType',
    ]);
    if (result.recentNotifications) {
      recentNotifications = result.recentNotifications as StoredNotification[];
    }
    if (typeof result.unreadCount === 'number') {
      unreadCount = result.unreadCount;
    }
    if (result.lastNotificationType) {
      lastNotificationType = result.lastNotificationType as NotificationType;
    }
    // Restore badge state
    if (unreadCount > 0) {
      updateNotificationBadge();
    }
  } catch {
    // Ignore errors
  }
}

// Message handling from popup
browser.runtime.onMessage.addListener(
  (message: unknown): Promise<StatusResponse | SuccessResponse> | undefined => {
    const msg = message as RuntimeMessage;

    if (msg.type === 'getStatus') {
      return Promise.resolve({
        isConnected,
        recentNotifications,
        unreadCount,
      } as StatusResponse);
    }

    if (msg.type === 'markAsRead') {
      // Clear unread count when popup is opened
      clearUnreadCount();
      return Promise.resolve({ success: true });
    }

    if (msg.type === 'testNotification') {
      // Add test notification to recent list and show it
      const testData: IncomingNotification = {
        type: 'permission_prompt',
        message: 'This is a test notification from Claude Code Notifier',
      };
      addRecentNotification(testData);
      showNotification(testData);
      return Promise.resolve({ success: true });
    }

    if (msg.type === 'reconnect') {
      reconnectDelay = RECONNECT_INITIAL_DELAY;
      if (ws) {
        ws.close();
      }
      connect();
      return Promise.resolve({ success: true });
    }

    if (msg.type === 'clearNotifications') {
      recentNotifications = [];
      clearUnreadCount();
      return Promise.resolve({ success: true });
    }

    return undefined;
  }
);

// Handle notification clicks
browser.notifications.onClicked.addListener((notificationId: string): void => {
  browser.notifications.clear(notificationId);
  // Clear badge when user clicks a notification
  clearUnreadCount();
});

// Initialize
loadState().then(() => {
  connect();
});

// Handle Chrome service worker lifecycle
declare const self: { addEventListener(type: string, listener: () => void): void } | undefined;
if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('activate', () => {
    connect();
  });
}
