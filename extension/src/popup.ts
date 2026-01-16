import browser from 'webextension-polyfill';
import type { Settings, StoredNotification, NotificationType, StatusResponse } from './types';

// Type labels for display
const TYPE_LABELS: Record<NotificationType, string> = {
  permission_prompt: 'Permission Needed',
  idle_prompt: 'Waiting for Input',
  stop: 'Finished',
};

// DOM elements
const statusEl = document.getElementById('status') as HTMLDivElement;
const statusTextEl = statusEl.querySelector('.status-text') as HTMLSpanElement;
const notificationsEnabledEl = document.getElementById('notificationsEnabled') as HTMLInputElement;
const soundEnabledEl = document.getElementById('soundEnabled') as HTMLInputElement;
const notifyOnIdleEl = document.getElementById('notifyOnIdle') as HTMLInputElement;
const notifyOnStopEl = document.getElementById('notifyOnStop') as HTMLInputElement;
const testBtn = document.getElementById('testBtn') as HTMLButtonElement;
const reconnectBtn = document.getElementById('reconnectBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
const notificationListEl = document.getElementById('notificationList') as HTMLDivElement;

// Load settings and status
async function init(): Promise<void> {
  // Load settings
  const result = await browser.storage.local.get(['settings', 'isConnected', 'recentNotifications']);

  const settings = (result.settings as Partial<Settings>) || {};
  notificationsEnabledEl.checked = settings.notificationsEnabled !== false;
  soundEnabledEl.checked = settings.soundEnabled !== false;
  notifyOnIdleEl.checked = settings.notifyOnIdle !== false;
  notifyOnStopEl.checked = settings.notifyOnStop !== false;

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
}

function renderNotifications(notifications: StoredNotification[]): void {
  if (!notifications || notifications.length === 0) {
    notificationListEl.innerHTML = '<p class="empty-state">No recent notifications</p>';
    return;
  }

  notificationListEl.innerHTML = notifications
    .map((n) => {
      const time = new Date(n.receivedAt || n.timestamp || '').toLocaleTimeString();
      return `
      <div class="notification-item ${n.type}">
        <span class="notification-type">${TYPE_LABELS[n.type] || n.type}</span>
        <span class="notification-message">${escapeHtml(n.message || 'No message')}</span>
        <span class="notification-time">${time}</span>
      </div>
    `;
    })
    .join('');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Save settings when changed
async function saveSettings(): Promise<void> {
  const settings: Settings = {
    notificationsEnabled: notificationsEnabledEl.checked,
    soundEnabled: soundEnabledEl.checked,
    notifyOnIdle: notifyOnIdleEl.checked,
    notifyOnStop: notifyOnStopEl.checked,
  };

  await browser.storage.local.set({ settings });
}

// Event listeners
notificationsEnabledEl.addEventListener('change', saveSettings);
soundEnabledEl.addEventListener('change', saveSettings);
notifyOnIdleEl.addEventListener('change', saveSettings);
notifyOnStopEl.addEventListener('change', saveSettings);

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
});

// Initialize
init();
