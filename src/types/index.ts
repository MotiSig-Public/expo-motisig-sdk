export type { LogLevel } from '../internal/logger';
import type { LogLevel } from '../internal/logger';

export type AppPlatform = 'ios' | 'android' | 'web';

/** Push channel keys stored server-side. */
export type PushPlatform = 'expo' | 'fcm' | 'apns';

export interface MotiSigUser {
  id?: string;
  projectId?: string;
  platform?: AppPlatform;
  firstName?: string;
  lastName?: string;
  email?: string;
  timezone?: string;
  locale?: string;
  lastSessionAt?: string;
  accountCreatedAt?: string;
  tags?: string[];
  customAttributes?: Record<string, unknown>;
}

export interface RegisterUserPayload {
  id: string;
  platform?: AppPlatform;
  timezone?: string;
  locale?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  tags?: string[];
  customAttributes?: Record<string, unknown>;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  timezone?: string;
  locale?: string;
}

export type PushSubscriptionPermission = 'granted' | 'declined' | 'unknown';

/** POST /users/{id}/push-subscriptions */
export interface PushSubscriptionUpsertPayload {
  devicePlatform: AppPlatform;
  pushType: PushPlatform;
  token: string;
  permission?: PushSubscriptionPermission;
  enabled?: boolean;
}

/** PATCH /users/{id}/push-subscriptions (identity fields required by API). */
export interface PushSubscriptionPatchPayload {
  devicePlatform: AppPlatform;
  pushType: PushPlatform;
  token: string;
  permission?: PushSubscriptionPermission;
  enabled?: boolean;
}

/** DELETE /users/{id}/push-subscriptions */
export interface PushSubscriptionRemovePayload {
  devicePlatform: AppPlatform;
  pushType: PushPlatform;
  token: string;
}

export interface TrackClickPayload {
  userId: string;
  messageId: string;
  isForeground?: boolean;
}


export interface MotiSigClickRetryOptions {
  /** Maximum send attempts per queued click (default 50). */
  maxAttempts?: number;
  /** Base delay for exponential backoff in ms (default 1000). */
  baseDelayMs?: number;
  /** Maximum backoff delay in ms (default 60000). */
  maxDelayMs?: number;
}

export interface MotiSigInitializeOptions {
  sdkKey: string;
  projectId: string;
  /**
   * API base URL. If omitted, uses `EXPO_PUBLIC_MOTISIG_BASE_URL` when set (Expo public env),
   * otherwise the MotiSig production default.
   */
  baseURL?: string;
  /**
   * EAS project UUID for `getExpoPushTokenAsync`.
   * If omitted, uses `expo-constants` `Constants.expoConfig?.extra?.eas?.projectId`.
   */
  easProjectId?: string;
  /** When true, skips requesting notification permissions during `initialize`. Default false. */
  skipPermissionRequest?: boolean;
  /** When true, does not attach expo-notifications listeners. Default false. */
  skipNotificationListeners?: boolean;
  /** Foreground heartbeat ping interval in seconds. Default 60; invalid or non-finite values use 60; max 86400. */
  pingIntervalSeconds?: number;
  /** Verbosity for the SDK's internal console logger. Default 'info'. */
  logLevel?: LogLevel;
  /** Options for persisted click queue retries (exponential backoff). */
  clickRetry?: MotiSigClickRetryOptions;
}

export type MotiSigNotificationPayload = Record<string, unknown> | undefined;

export interface MotiSigForegroundNotificationEvent {
  type: 'foreground_notification';
  /** Raw Expo notification (for advanced use). */
  notification: import('expo-notifications').Notification;
  data: MotiSigNotificationPayload;
}

export interface MotiSigNotificationResponseEvent {
  type: 'notification_response';
  response: import('expo-notifications').NotificationResponse;
  data: MotiSigNotificationPayload;
  /** True when the same notification was previously seen in foreground. */
  wasForeground: boolean;
}

export interface MotiSigTokenRefreshEvent {
  type: 'token_refresh';
  token: string;
  previousToken?: string;
}

export type MotiSigClientEvent =
  | MotiSigForegroundNotificationEvent
  | MotiSigNotificationResponseEvent
  | MotiSigTokenRefreshEvent;

export type MotiSigEventListener = (event: MotiSigClientEvent) => void;
