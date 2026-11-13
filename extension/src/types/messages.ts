import type { StoredNotification } from './notifications';

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

export interface RemoveNotificationMessage {
  type: 'removeNotification';
  index: number;
}

export type RuntimeMessage =
  | GetStatusMessage
  | MarkAsReadMessage
  | TestNotificationMessage
  | ReconnectMessage
  | ClearNotificationsMessage
  | RemoveNotificationMessage;

export interface StatusResponse {
  isConnected: boolean;
  recentNotifications: StoredNotification[];
  unreadCount: number;
}

export interface SuccessResponse {
  success: boolean;
  notifications?: StoredNotification[];
}

export type RuntimeResponse = StatusResponse | SuccessResponse;

export type ConnectionStatus = 'connected' | 'disconnected' | 'error';
