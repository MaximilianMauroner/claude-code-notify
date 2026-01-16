export interface Settings {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  notifyOnStop: boolean;
  notifyOnIdle: boolean;
  darkMode: boolean;
  hideDisconnectedHelp: boolean;
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  soundEnabled: false,
  notifyOnStop: true,
  notifyOnIdle: true,
  darkMode: false,
  hideDisconnectedHelp: false,
  debugMode: false,
};
