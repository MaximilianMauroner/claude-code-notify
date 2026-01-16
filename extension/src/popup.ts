import browser from 'webextension-polyfill';
import type { Settings, StoredNotification, NotificationType, StatusResponse } from './types';
import { DEFAULT_SETTINGS } from './types';

// Type labels for display
const TYPE_LABELS: Record<NotificationType, string> = {
  permission_prompt: 'Permission Needed',
  idle_prompt: 'Waiting for Input',
  stop: 'Finished',
};

// DOM elements
const statusEl = document.getElementById('status') as HTMLDivElement;
const statusTextEl = statusEl.querySelector('.status-text') as HTMLSpanElement;
const setupHelpEl = document.getElementById('setupHelp') as HTMLDivElement;
const hideSetupHelpEl = document.getElementById('hideSetupHelp') as HTMLInputElement;
const notificationsEnabledEl = document.getElementById('notificationsEnabled') as HTMLInputElement;
const soundEnabledEl = document.getElementById('soundEnabled') as HTMLInputElement;
const notifyOnIdleEl = document.getElementById('notifyOnIdle') as HTMLInputElement;
const notifyOnStopEl = document.getElementById('notifyOnStop') as HTMLInputElement;
const darkModeEl = document.getElementById('darkMode') as HTMLInputElement;
const debugModeEl = document.getElementById('debugMode') as HTMLInputElement;
const testBtn = document.getElementById('testBtn') as HTMLButtonElement;
const reconnectBtn = document.getElementById('reconnectBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
const notificationListEl = document.getElementById('notificationList') as HTMLDivElement;
let currentSettings: Settings = { ...DEFAULT_SETTINGS };

// Load settings and status
async function init(): Promise<void> {
  // Load settings
  const result = await browser.storage.local.get(['settings', 'isConnected', 'recentNotifications']);

  currentSettings = { ...DEFAULT_SETTINGS, ...(result.settings as Partial<Settings>) };
  notificationsEnabledEl.checked = currentSettings.notificationsEnabled;
  soundEnabledEl.checked = currentSettings.soundEnabled;
  notifyOnIdleEl.checked = currentSettings.notifyOnIdle;
  notifyOnStopEl.checked = currentSettings.notifyOnStop;
  darkModeEl.checked = currentSettings.darkMode;
  debugModeEl.checked = currentSettings.debugMode;
  hideSetupHelpEl.checked = currentSettings.hideDisconnectedHelp;
  applyTheme(currentSettings.darkMode);

  // Update connection status
  updateStatus(result.isConnected as boolean);

  // Render recent notifications
  renderNotifications((result.recentNotifications as StoredNotification[]) || []);

  // Get fresh status from background and mark as read
  const response = (await browser.runtime.sendMessage({ type: 'getStatus' })) as StatusResponse;
  if (response) {
    updateStatus(response.isConnected);
    renderNotifications(response.recentNotifications || []);
  }

  // Mark notifications as read when popup opens (clears badge)
  await browser.runtime.sendMessage({ type: 'markAsRead' });
}

function updateStatus(isConnected: boolean): void {
  statusEl.className = `status ${isConnected ? 'connected' : 'disconnected'}`;
  statusTextEl.textContent = isConnected ? 'Connected' : 'Disconnected';
  setupHelpEl.classList.toggle('hidden', isConnected || currentSettings.hideDisconnectedHelp);
}

function renderNotifications(notifications: StoredNotification[]): void {
  // Clear existing content
  notificationListEl.textContent = '';

  if (!notifications || notifications.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No recent notifications';
    notificationListEl.appendChild(emptyState);
    return;
  }

  notifications.forEach((n, index) => {
    const time = new Date(n.receivedAt || n.timestamp || '').toLocaleTimeString();

    const item = document.createElement('div');
    item.className = `notification-item ${n.type}`;

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'notification-dismiss';
    dismissBtn.dataset.index = String(index);
    dismissBtn.title = 'Dismiss';
    dismissBtn.textContent = '×';
    dismissBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await browser.runtime.sendMessage({ type: 'removeNotification', index });
    });

    const typeSpan = document.createElement('span');
    typeSpan.className = 'notification-type';
    typeSpan.textContent = TYPE_LABELS[n.type] || n.type;

    const messageSpan = document.createElement('span');
    messageSpan.className = 'notification-message';
    messageSpan.textContent = n.message || 'No message';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'notification-time';
    timeSpan.textContent = time;

    item.appendChild(dismissBtn);
    item.appendChild(typeSpan);
    item.appendChild(messageSpan);
    item.appendChild(timeSpan);
    notificationListEl.appendChild(item);
  });
}

function applyTheme(darkMode: boolean): void {
  document.body.classList.toggle('dark', darkMode);
}

// Save settings when changed
async function saveSettings(): Promise<void> {
  const settings: Settings = {
    notificationsEnabled: notificationsEnabledEl.checked,
    soundEnabled: soundEnabledEl.checked,
    notifyOnIdle: notifyOnIdleEl.checked,
    notifyOnStop: notifyOnStopEl.checked,
    darkMode: darkModeEl.checked,
    debugMode: debugModeEl.checked,
    hideDisconnectedHelp: hideSetupHelpEl.checked,
  };

  currentSettings = settings;
  await browser.storage.local.set({ settings });
}

// Event listeners
notificationsEnabledEl.addEventListener('change', saveSettings);
soundEnabledEl.addEventListener('change', saveSettings);
notifyOnIdleEl.addEventListener('change', saveSettings);
notifyOnStopEl.addEventListener('change', saveSettings);
debugModeEl.addEventListener('change', saveSettings);
darkModeEl.addEventListener('change', () => {
  applyTheme(darkModeEl.checked);
  saveSettings();
});
hideSetupHelpEl.addEventListener('change', () => {
  saveSettings();
  updateStatus(statusEl.classList.contains('connected'));
});

testBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ type: 'testNotification' });
});

reconnectBtn.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'reconnect' });
  // Refresh status after a short delay
  setTimeout(init, 500);
});

clearBtn.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'clearNotifications' });
  renderNotifications([]);
});

// Listen for storage changes to update UI
browser.storage.onChanged.addListener((changes) => {
  if (changes.isConnected) {
    updateStatus(changes.isConnected.newValue as boolean);
  }
  if (changes.recentNotifications) {
    renderNotifications((changes.recentNotifications.newValue as StoredNotification[]) || []);
  }
  if (changes.settings) {
    const nextSettings = changes.settings.newValue as Settings | undefined;
    if (nextSettings && typeof nextSettings.darkMode === 'boolean') {
      currentSettings = { ...DEFAULT_SETTINGS, ...nextSettings };
      darkModeEl.checked = nextSettings.darkMode;
      applyTheme(nextSettings.darkMode);
      if (typeof nextSettings.hideDisconnectedHelp === 'boolean') {
        hideSetupHelpEl.checked = nextSettings.hideDisconnectedHelp;
      }
      updateStatus(statusEl.classList.contains('connected'));
    }
  }
});

// Initialize
init();
