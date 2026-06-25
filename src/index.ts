export { MotiSigApi, createMotiSigApi } from './api/motiSigApi';
export { MotiSigHttpClient } from './api/httpClient';
export { MotiSigEmitter } from './internal/emitter';
export { DEFAULT_MOTISIG_BASE_URL } from './constants/defaultBaseUrl';
export { resolveClientBaseUrl } from './runtime/resolveClientBaseUrl';
export { MotiSigApiError, MotiSigError } from './errors';

/**
 * Avoid eager `require` of expo-notifications / MotiSig at package load (bridgeless / New Architecture).
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { requestNotificationPermissions: request } =
    require('./expo/notificationPermissions') as typeof import('./expo/notificationPermissions');
  return request();
}

export async function getNotificationPermissionStatus(): Promise<
  import('expo-notifications').PermissionStatus
> {
  const { getNotificationPermissionStatus: getStatus } =
    require('./expo/notificationPermissions') as typeof import('./expo/notificationPermissions');
  return getStatus();
}

export function getAppPlatform(): import('./types').AppPlatform {
  return (require('./runtime/appPlatform') as typeof import('./runtime/appPlatform')).getAppPlatform();
}

/** Lazily loads the real class so importing this package does not touch native modules before the runtime is ready. */
export const MotiSig = new Proxy(class MotiSigPlaceholder {}, {
  construct() {
    const { MotiSig: MotiSigClass } = require('./client/MotiSig') as typeof import('./client/MotiSig');
    return new MotiSigClass();
  },
}) as unknown as (typeof import('./client/MotiSig'))['MotiSig'];

export type {
  LogLevel,
  AppPlatform,
  PushPlatform,
  RegisterUserPayload,
  UpdateUserPayload,
  TrackClickPayload,
  PushSubscriptionPermission,
  PushSubscriptionUpsertPayload,
  PushSubscriptionPatchPayload,
  PushSubscriptionRemovePayload,
  MotiSigInitializeOptions,
  MotiSigForegroundNotificationEvent,
  MotiSigNotificationResponseEvent,
  MotiSigTokenRefreshEvent,
  MotiSigClientEvent,
  MotiSigEventListener,
  MotiSigNotificationPayload,
} from './types';
export type { RegisterUserResponse, TriggerEventResponse } from './api/motiSigApi';
