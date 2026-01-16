// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// DOM elements
const statusEl = document.getElementById('status');
const statusTextEl = statusEl.querySelector('.status-text');
const notificationsEnabledEl = document.getElementById('notificationsEnabled');
const soundEnabledEl = document.getElementById('soundEnabled');
const notifyOnIdleEl = document.getElementById('notifyOnIdle');
const notifyOnStopEl = document.getElementById('notifyOnStop');
const testBtn = document.getElementById('testBtn');
const reconnectBtn = document.getElementById('reconnectBtn');
const clearBtn = document.getElementById('clearBtn');
const notificationListEl = document.getElementById('notificationList');

// Load settings and status
async function init() {
  // Load settings
  const result = await browserAPI.storage.local.get(['settings', 'isConnected', 'recentNotifications']);

  const settings = result.settings || {};
  notificationsEnabledEl.checked = settings.notificationsEnabled !== false;
  soundEnabledEl.checked = settings.soundEnabled !== false;
  notifyOnIdleEl.checked = settings.notifyOnIdle !== false;
  notifyOnStopEl.checked = settings.notifyOnStop !== false;

  // Update connection status
  updateStatus(result.isConnected);

  // Render recent notifications
  renderNotifications(result.recentNotifications || []);

  // Get fresh status from background
  browserAPI.runtime.sendMessage({ type: 'getStatus' }, (response) => {
    if (response) {
      updateStatus(response.isConnected);
      renderNotifications(response.recentNotifications || []);
    }
  });
}

function updateStatus(isConnected) {
  statusEl.className = `status ${isConnected ? 'connected' : 'disconnected'}`;
  statusTextEl.textContent = isConnected ? 'Connected' : 'Disconnected';
}

function renderNotifications(notifications) {
  if (!notifications || notifications.length === 0) {
    notificationListEl.innerHTML = '<p class="empty-state">No recent notifications</p>';
    return;
  }

  const typeLabels = {
    permission_prompt: 'Permission Needed',
    idle_prompt: 'Waiting for Input',
    stop: 'Finished'
  };

  notificationListEl.innerHTML = notifications.map(n => {
    const time = new Date(n.receivedAt || n.timestamp).toLocaleTimeString();
    return `
      <div class="notification-item ${n.type}">
        <span class="notification-type">${typeLabels[n.type] || n.type}</span>
        <span class="notification-message">${escapeHtml(n.message || 'No message')}</span>
        <span class="notification-time">${time}</span>
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Save settings when changed
async function saveSettings() {
  const settings = {
    notificationsEnabled: notificationsEnabledEl.checked,
    soundEnabled: soundEnabledEl.checked,
    notifyOnIdle: notifyOnIdleEl.checked,
    notifyOnStop: notifyOnStopEl.checked
  };

  await browserAPI.storage.local.set({ settings });
}

// Event listeners
notificationsEnabledEl.addEventListener('change', saveSettings);
soundEnabledEl.addEventListener('change', saveSettings);
notifyOnIdleEl.addEventListener('change', saveSettings);
notifyOnStopEl.addEventListener('change', saveSettings);

testBtn.addEventListener('click', () => {
  browserAPI.runtime.sendMessage({ type: 'testNotification' });
});

reconnectBtn.addEventListener('click', () => {
  browserAPI.runtime.sendMessage({ type: 'reconnect' }, () => {
    // Refresh status after a short delay
    setTimeout(init, 500);
  });
});

clearBtn.addEventListener('click', () => {
  browserAPI.runtime.sendMessage({ type: 'clearNotifications' }, () => {
    renderNotifications([]);
  });
});

// Listen for storage changes to update UI
browserAPI.storage.onChanged.addListener((changes) => {
  if (changes.isConnected) {
    updateStatus(changes.isConnected.newValue);
  }
  if (changes.recentNotifications) {
    renderNotifications(changes.recentNotifications.newValue || []);
  }
});

// Initialize
init();
