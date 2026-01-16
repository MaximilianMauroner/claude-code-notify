export type NotificationType = 'permission_prompt' | 'idle_prompt' | 'stop';

export interface NotificationConfig {
  title: string;
  iconUrl: string;
  priority: number;
  requireInteraction: boolean;
}

export type NotificationConfigMap = Record<NotificationType, NotificationConfig>;

export interface StoredNotification {
  type: NotificationType;
  message?: string;
  timestamp?: string;
  receivedAt: string;
}

export interface IncomingNotification {
  type: NotificationType | 'connected' | 'pong';
  message?: string;
  timestamp?: string;
}
