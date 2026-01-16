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
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// Debug mode state (cached for sync access)
let debugMode = false;

// Debug logging helpers
function debugLog(...args: unknown[]): void {
  if (debugMode) {
    console.log('[Claude Notifier]', ...args);
  }
}

function debugError(...args: unknown[]): void {
  if (debugMode) {
    console.error('[Claude Notifier]', ...args);
  }
}

function debugWarn(...args: unknown[]): void {
  if (debugMode) {
    console.warn('[Claude Notifier]', ...args);
  }
}

// Track if offscreen document exists
let creatingOffscreen: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  try {
    if (chrome.runtime?.getContexts) {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
      });
      return existingContexts.length > 0;
    }
  } catch {
    // Fall back to other checks if runtime contexts are unavailable.
  }

  if (chrome.offscreen && 'hasDocument' in chrome.offscreen) {
    try {
      return await chrome.offscreen.hasDocument();
    } catch {
      return false;
    }
  }

  return false;
}

async function setupOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen?.createDocument) {
    throw new Error('Offscreen API not available');
  }

  // Check if offscreen document already exists
  if (await hasOffscreenDocument()) {
    return;
  }

  // Create offscreen document if we're not already creating one
  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Play notification sound for Claude Code alerts',
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

// Play notification sound via offscreen document
async function playNotificationSound(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'PLAY_SOUND' });
    debugLog('Played notification sound');
  } catch (error) {
    debugError('Error playing sound:', error);
  }
}

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

  debugLog('Attempting to connect to', WS_URL);

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = (): void => {
      debugLog('Connected to server');
      isConnected = true;
      reconnectDelay = RECONNECT_INITIAL_DELAY;
      updateBadge('connected');
      startKeepalive();
      saveState();
    };

    ws.onmessage = async (event: MessageEvent): Promise<void> => {
      try {
        const data = JSON.parse(event.data as string) as IncomingNotification;
        debugLog('Received message:', data.type);

        if (data.type === 'connected' || data.type === 'pong') {
          return;
        }

        // Store notification in recent list
        addRecentNotification(data as StoredNotification);

        // Check if notifications are enabled
        const settings = await getSettings();
        if (!settings.notificationsEnabled) {
          debugLog('Notifications disabled, skipping');
          return;
        }

        // Show browser notification
        await showNotification(data);
      } catch (error) {
        debugError('Error processing message:', error);
      }
    };

    ws.onclose = (): void => {
      debugLog('Disconnected from server');
      isConnected = false;
      updateBadge('disconnected');
      stopKeepalive();
      saveState();
      scheduleReconnect();
    };

    ws.onerror = (error: Event): void => {
      debugError('WebSocket error:', error);
      isConnected = false;
      updateBadge('error');
    };
  } catch (error) {
    debugError('Connection error:', error);
    scheduleReconnect();
  }
}

// Reconnection with exponential backoff
function scheduleReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  debugLog(`Reconnecting in ${reconnectDelay}ms...`);

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
async function showNotification(
  data: IncomingNotification,
  options?: { skipSound?: boolean }
): Promise<void> {
  if (data.type === 'connected' || data.type === 'pong') return;

  const config: NotificationConfig = NOTIFICATION_CONFIG[data.type];
  if (!config) return;

  const settings = await getSettings();
  const shouldPlaySound = settings.soundEnabled && !options?.skipSound;
  let useCustomSound = false;

  // Check notification type settings
  if (data.type === 'stop' && !settings.notifyOnStop) return;
  if (data.type === 'idle_prompt' && !settings.notifyOnIdle) return;

  if (shouldPlaySound) {
    try {
      await setupOffscreenDocument();
      useCustomSound = true;
    } catch (error) {
      debugWarn('Offscreen audio unavailable, using system sound.', error);
    }
  }

  const notificationId = `claude-${Date.now()}`;
  const iconUrl = browser.runtime.getURL(config.iconUrl);

  const notificationOptions: browser.Notifications.CreateNotificationOptions = {
    type: 'basic',
    iconUrl,
    title: config.title,
    message: data.message || 'Claude Code requires your attention',
    // Suppress OS sounds when disabled or when custom audio is available.
    silent: !shouldPlaySound || useCustomSound,
  };

  try {
    await browser.notifications.create(notificationId, notificationOptions);
    debugLog('Created notification:', data.type, notificationId);
  } catch (error) {
    debugError('Error creating notification:', error);
  }

  // Play sound if enabled (unless explicitly skipped)
  if (shouldPlaySound && useCustomSound) {
    playNotificationSound();
  }

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
    const settings = { ...DEFAULT_SETTINGS, ...(result.settings as Partial<Settings>) };
    debugMode = settings.debugMode;
    return settings;
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
      'settings',
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
    // Load debug mode setting
    if (result.settings) {
      const settings = result.settings as Partial<Settings>;
      debugMode = settings.debugMode ?? DEFAULT_SETTINGS.debugMode;
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
      // Show notification - sound will play based on soundEnabled setting
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

    if (msg.type === 'removeNotification') {
      const index = (msg as { type: string; index: number }).index;
      if (index >= 0 && index < recentNotifications.length) {
        recentNotifications.splice(index, 1);
        // Update unread count if needed
        if (unreadCount > 0) {
          unreadCount = Math.max(0, unreadCount - 1);
        }
        updateNotificationBadge();
        saveState();
      }
      return Promise.resolve({ success: true, notifications: recentNotifications });
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

// Listen for settings changes to update debug mode
browser.storage.onChanged.addListener((changes) => {
  if (changes.settings?.newValue) {
    const newSettings = changes.settings.newValue as Partial<Settings>;
    if (typeof newSettings.debugMode === 'boolean') {
      debugMode = newSettings.debugMode;
      debugLog('Debug mode', debugMode ? 'enabled' : 'disabled');
    }
  }
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
