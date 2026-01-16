export interface Settings {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  notifyOnStop: boolean;
  notifyOnIdle: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  soundEnabled: true,
  notifyOnStop: true,
  notifyOnIdle: true,
};
