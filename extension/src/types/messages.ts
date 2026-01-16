import type { StoredNotification, NotificationType } from './notifications';

export interface GetStatusMessage {
  type: 'getStatus';
}

export interface MarkAsReadMessage {
  type: 'markAsRead';
}

export interface TestNotificationMessage {
  type: 'testNotification';
}

export interface ReconnectMessage {
  type: 'reconnect';
}

export interface ClearNotificationsMessage {
  type: 'clearNotifications';
}

export type RuntimeMessage =
  | GetStatusMessage
  | MarkAsReadMessage
  | TestNotificationMessage
  | ReconnectMessage
  | ClearNotificationsMessage;

export interface StatusResponse {
  isConnected: boolean;
  recentNotifications: StoredNotification[];
  unreadCount: number;
}

export interface SuccessResponse {
  success: boolean;
}

export type RuntimeResponse = StatusResponse | SuccessResponse;

export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

export type BadgeStatus = ConnectionStatus | NotificationType;
