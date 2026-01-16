// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Configuration
const WS_URL = 'ws://localhost:3099';
const RECONNECT_INITIAL_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const KEEPALIVE_INTERVAL = 20000;

// State
let ws = null;
let reconnectDelay = RECONNECT_INITIAL_DELAY;
let reconnectTimeout = null;
let keepaliveInterval = null;
let isConnected = false;
let recentNotifications = [];
const MAX_RECENT_NOTIFICATIONS = 10;

// Notification configuration
const NOTIFICATION_CONFIG = {
  permission_prompt: {
    title: 'Claude needs permission',
    iconUrl: 'icons/icon128.png',
    priority: 2,
    requireInteraction: true
  },
  idle_prompt: {
    title: 'Claude is waiting',
    iconUrl: 'icons/icon128.png',
    priority: 1,
    requireInteraction: false
  },
  stop: {
    title: 'Claude finished',
    iconUrl: 'icons/icon128.png',
    priority: 0,
    requireInteraction: false
  }
};

// Initialize connection
function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[Claude Notifier] Connected to server');
      isConnected = true;
      reconnectDelay = RECONNECT_INITIAL_DELAY;
      updateBadge('connected');
      startKeepalive();
      saveState();
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected' || data.type === 'pong') {
          return;
        }

        // Store notification in recent list
        addRecentNotification(data);

        // Check if notifications are enabled
        const settings = await getSettings();
        if (!settings.notificationsEnabled) {
          return;
        }

        // Show browser notification
        showNotification(data);
      } catch (error) {
        console.error('[Claude Notifier] Error processing message:', error);
      }
    };

    ws.onclose = () => {
      console.log('[Claude Notifier] Disconnected from server');
      isConnected = false;
      updateBadge('disconnected');
      stopKeepalive();
      saveState();
      scheduleReconnect();
    };

    ws.onerror = (error) => {
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
function scheduleReconnect() {
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
function startKeepalive() {
  stopKeepalive();
  keepaliveInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, KEEPALIVE_INTERVAL);
}

function stopKeepalive() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

// Badge updates
function updateBadge(status) {
  const colors = {
    connected: '#22c55e',    // Green
    disconnected: '#6b7280', // Gray
    error: '#ef4444'         // Red
  };

  const texts = {
    connected: '',
    disconnected: '!',
    error: 'X'
  };

  browserAPI.action?.setBadgeBackgroundColor({ color: colors[status] }) ||
    browserAPI.browserAction?.setBadgeBackgroundColor({ color: colors[status] });

  browserAPI.action?.setBadgeText({ text: texts[status] }) ||
    browserAPI.browserAction?.setBadgeText({ text: texts[status] });
}

// Show notification
async function showNotification(data) {
  const config = NOTIFICATION_CONFIG[data.type];
  if (!config) return;

  const settings = await getSettings();

  // Check notification type settings
  if (data.type === 'stop' && !settings.notifyOnStop) return;
  if (data.type === 'idle_prompt' && !settings.notifyOnIdle) return;

  const notificationId = `claude-${Date.now()}`;

  const options = {
    type: 'basic',
    iconUrl: config.iconUrl,
    title: config.title,
    message: data.message || 'Claude Code requires your attention',
    priority: config.priority,
    requireInteraction: config.requireInteraction
  };

  // Add silent option based on settings
  if (!settings.soundEnabled && data.type !== 'permission_prompt') {
    options.silent = true;
  }

  browserAPI.notifications.create(notificationId, options);

  // Auto-close non-interactive notifications after 5 seconds
  if (!config.requireInteraction) {
    setTimeout(() => {
      browserAPI.notifications.clear(notificationId);
    }, 5000);
  }
}

// Settings management
async function getSettings() {
  const defaults = {
    notificationsEnabled: true,
    soundEnabled: true,
    notifyOnStop: true,
    notifyOnIdle: true
  };

  try {
    const result = await browserAPI.storage.local.get('settings');
    return { ...defaults, ...result.settings };
  } catch {
    return defaults;
  }
}

async function saveSettings(settings) {
  await browserAPI.storage.local.set({ settings });
}

// Recent notifications management
function addRecentNotification(notification) {
  recentNotifications.unshift({
    ...notification,
    receivedAt: new Date().toISOString()
  });

  if (recentNotifications.length > MAX_RECENT_NOTIFICATIONS) {
    recentNotifications.pop();
  }

  saveState();
}

async function saveState() {
  await browserAPI.storage.local.set({
    isConnected,
    recentNotifications
  });
}

async function loadState() {
  try {
    const result = await browserAPI.storage.local.get(['recentNotifications']);
    if (result.recentNotifications) {
      recentNotifications = result.recentNotifications;
    }
  } catch {
    // Ignore errors
  }
}

// Message handling from popup
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getStatus') {
    sendResponse({
      isConnected,
      recentNotifications
    });
    return true;
  }

  if (message.type === 'testNotification') {
    showNotification({
      type: 'permission_prompt',
      message: 'This is a test notification from Claude Code Notifier'
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'reconnect') {
    reconnectDelay = RECONNECT_INITIAL_DELAY;
    if (ws) {
      ws.close();
    }
    connect();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'clearNotifications') {
    recentNotifications = [];
    saveState();
    sendResponse({ success: true });
    return true;
  }
});

// Handle notification clicks
browserAPI.notifications.onClicked.addListener((notificationId) => {
  browserAPI.notifications.clear(notificationId);
});

// Initialize
loadState().then(() => {
  connect();
});

// Handle Chrome service worker lifecycle
if (typeof self !== 'undefined' && self.addEventListener) {
  self.addEventListener('activate', () => {
    connect();
  });
}
