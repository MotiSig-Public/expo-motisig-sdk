import { AppState } from 'react-native';
import { createMotiSigApi, type MotiSigApi } from '../api/motiSigApi';
import { requestNotificationPermissions } from '../expo/notificationPermissions';
import { MotiSigApiError } from '../errors';
import { MotiSigEmitter } from '../internal/emitter';
import { AsyncQueue } from '../internal/asyncQueue';
import { logger, setLogLevel } from '../internal/logger';
import { ClickDispatcher } from '../internal/clickDispatcher';
import { loadCustomerPushEnabled, persistCustomerPushEnabled } from '../internal/pushSubscriptionPrefs';
import { clearPersistedUserId, loadPersistedUserId, persistUserId } from '../internal/userIdStore';
import { getAppPlatform } from '../runtime/appPlatform';
import { resolveClientBaseUrl } from '../runtime/resolveClientBaseUrl';
import type {
  MotiSigInitializeOptions,
  MotiSigEventListener,
  MotiSigNotificationPayload,
  PushSubscriptionPermission,
  RegisterUserPayload,
  UpdateUserPayload,
  MotiSigUser,
} from '../types';

type Subscription = { remove: () => void };

function notifications(): typeof import('expo-notifications') {
  return require('expo-notifications');
}

function device(): typeof import('expo-device') {
  return require('expo-device');
}

function constants(): typeof import('expo-constants').default {
  return require('expo-constants').default;
}

const MAX_FOREGROUND_IDS = 10;
const DEFAULT_PING_INTERVAL_SEC = 60;
const MAX_PING_INTERVAL_SEC = 86400;

function normalizePingIntervalSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PING_INTERVAL_SEC;
  const n = Math.floor(value);
  if (n <= 0) return DEFAULT_PING_INTERVAL_SEC;
  return Math.min(n, MAX_PING_INTERVAL_SEC);
}

function getMessageId(data: MotiSigNotificationPayload): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const raw = (data as Record<string, unknown>).messageId ?? (data as Record<string, unknown>).message_id;
  return typeof raw === 'string' ? raw : undefined;
}

function asDataRecord(data: unknown): MotiSigNotificationPayload {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return undefined;
}

/**
 * MotiSig AI client for Expo / React Native: HTTP client + Expo push token and notification listeners.
 */
export class MotiSig {
  readonly events = new MotiSigEmitter();

  private api: MotiSigApi | null = null;
  private initialized = false;
  private listenersAttached = false;
  private readonly mutationQueue = new AsyncQueue();
  private clickDispatcher: ClickDispatcher | null = null;

  private pushTokenSub: Subscription | null = null;
  private receivedSub: Subscription | null = null;
  private responseSub: Subscription | null = null;

  private foregroundIds = new Set<string>();
  private foregroundOrder: string[] = [];

  private lastToken: string | null = null;
  private userId: string | null = null;
  private tokenRefreshBusy = false;

  private easProjectId: string | undefined;
  private skipNotificationListeners = false;

  private customerPushEnabled = true;
  private lastSyncedPermission: PushSubscriptionPermission | null = null;
  private appStateSub: Subscription | null = null;
  private foregroundPingInterval: ReturnType<typeof setInterval> | null = null;
  private pingIntervalMs = DEFAULT_PING_INTERVAL_SEC * 1000;

  get isInitialized(): boolean {
    return this.initialized;
  }

  get currentUserId(): string | null {
    return this.userId;
  }

  /** Customer preference for server-side Expo push for this device (independent of OS permission). */
  get isNotificationEnabled(): boolean {
    return this.customerPushEnabled;
  }

  /**
   * Configure HTTP client and optionally set up notification permissions and listeners.
   */
  async initialize(options: MotiSigInitializeOptions): Promise<boolean> {
    setLogLevel(options.logLevel ?? 'info');
    if (this.initialized) return true;

    const sdkKey = options.sdkKey.trim();
    const projectId = options.projectId.trim();
    if (!sdkKey || !projectId) {
      logger.warn('initialize: missing sdkKey or projectId');
      return false;
    }

    const baseUrl = resolveClientBaseUrl(options.baseURL);
    logger.debug('initialize() called', { projectId, baseUrl });
    this.easProjectId =
      options.easProjectId?.trim() ||
      (constants().expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

    this.skipNotificationListeners = !!options.skipNotificationListeners;
    this.pingIntervalMs = normalizePingIntervalSeconds(options.pingIntervalSeconds) * 1000;

    this.api = createMotiSigApi({
      baseUrl,
      sdkKey,
      projectId,
    });

    const persistedUserId = await loadPersistedUserId();
    if (persistedUserId) {
      this.userId = persistedUserId;
    }

    this.clickDispatcher = new ClickDispatcher({
      apiProvider: () => this.api,
      userIdProvider: () => this.userId,
      clickRetry: options.clickRetry,
    });
    await this.clickDispatcher.start();

    this.customerPushEnabled = await loadCustomerPushEnabled();

    if (!options.skipPermissionRequest) {
      const ok = await requestNotificationPermissions();
      if (!ok) {
        logger.debug('notification permissions not granted; continuing HTTP-only');
      }
    }

    if (!this.skipNotificationListeners) {
      this.attachNotificationListeners();
    }

    if (!this.skipNotificationListeners) {
      try {
        const last = await notifications().getLastNotificationResponseAsync();
        const data = asDataRecord(last?.notification?.request?.content?.data);
        if (data) {
          this.processNotificationData(data, false);
        }
      } catch (err) {
        logger.debug('getLastNotificationResponseAsync failed', err);
      }
    }

    this.appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        this.clickDispatcher?.kick();
        void this.syncPushSubscriptionPermissionFromForeground();
        this.tryPingIfReady();
        this.startForegroundPing();
      } else {
        this.stopForegroundPing();
        this.tryPingIfReady();
      }
    });

    if (AppState.currentState === 'active') {
      void this.syncPushSubscriptionPermissionFromForeground();
      this.tryPingIfReady();
      this.startForegroundPing();
    }

    this.initialized = true;
    logger.info('MotiSig initialized');
    return true;
  }

  /** Resolves EAS project id from initialize options or `expo-constants`. */
  resolveEasProjectId(): string | undefined {
    return (
      this.easProjectId ||
      (constants().expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
    );
  }

  /**
   * Returns the Expo push token (requires physical device and EAS project id in app config).
   */
  async getExpoPushToken(): Promise<string | null> {
    if (!device().isDevice) return null;
    const projectId = this.resolveEasProjectId();
    if (!projectId) return null;
    try {
      const token = await notifications().getExpoPushTokenAsync({ projectId });
      this.lastToken = token.data;
      return token.data;
    } catch (err) {
      logger.warn('getExpoPushToken failed', err);
      return null;
    }
  }

  addListener(listener: MotiSigEventListener): () => void {
    return this.events.addListener(listener);
  }

  removeAllListeners(): void {
    this.events.clear();
  }

  /**
   * Registers or acknowledges the user server-side (POST /users, 409 tolerated), persists `currentUserId`, then registers Expo push token when available.
   */
  setUser(userId: string, extras?: Partial<RegisterUserPayload>): Promise<void> {
    return this.mutationQueue.run(async () => {
      const api = this.requireApi();
      const body: RegisterUserPayload = {
        ...extras,
        id: userId,
        platform: extras?.platform ?? getAppPlatform(),
        timezone: extras?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: extras?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale,
      };
      try {
        await api.registerUser(body);
      } catch (e) {
        if (e instanceof MotiSigApiError && e.statusCode === 409) {
          logger.debug('user already exists (409)', { userId });
        } else {
          throw e;
        }
      }
      const priorUserId = this.userId;
      this.userId = userId;
      if (priorUserId !== userId) {
        this.lastSyncedPermission = null;
      }
      await persistUserId(userId);
      await this.clickDispatcher?.onUserSet(userId);
      await this.syncExpoPushToken(api, userId);
    });
  }

  logout(): Promise<void> {
    return this.mutationQueue.run(async () => {
      const api = this.requireApi();
      const userId = this.userId;
      const token = this.lastToken ?? (await this.getExpoPushToken());
      if (userId && token) {
        try {
          await api.removePushSubscription(userId, {
            devicePlatform: getAppPlatform(),
            pushType: 'expo',
            token,
          });
        } catch (err) {
          logger.warn('logout: removePushSubscription failed', err);
        }
      }
      this.userId = null;
      this.lastSyncedPermission = null;
      await this.clickDispatcher?.clearAll();
      await clearPersistedUserId();
    });
  }

  /**
   * Customer-controlled server flag for this device’s Expo push subscription (independent of OS permission).
   */
  setNotificationEnabled(enabled: boolean): Promise<void> {
    return this.mutationQueue.run(async () => {
      await persistCustomerPushEnabled(enabled);
      this.customerPushEnabled = enabled;
      const api = this.requireApi();
      const userId = this.requireUserId();
      const token = this.lastToken ?? (await this.getExpoPushToken());
      if (!token) return;
      const permission = await this.resolveExpoPushPermission();
      try {
        await api.patchPushSubscription(userId, {
          devicePlatform: getAppPlatform(),
          pushType: 'expo',
          token,
          permission,
          enabled,
        });
        this.lastSyncedPermission = permission;
      } catch (err) {
        logger.warn('setNotificationEnabled: patchPushSubscription failed', err);
      }
    });
  }

  updateUser(payload: UpdateUserPayload): Promise<void> {
    return this.mutationQueue.run(async () => {
      const api = this.requireApi();
      const userId = this.requireUserId();
      await api.updateUser(userId, {
        ...payload,
        timezone: payload.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: payload.locale ?? Intl.DateTimeFormat().resolvedOptions().locale,
      });
    });
  }

  addTags(tags: string[]): Promise<void> {
    return this.mutationQueue.run(async () => {
      const api = this.requireApi();
      await api.addTags(this.requireUserId(), tags);
    });
  }

  removeTags(tags: string[]): Promise<void> {
    return this.mutationQueue.run(async () => {
      const api = this.requireApi();
      await api.removeTags(this.requireUserId(), tags);
    });
  }

  addOrUpdateAttributes(attributes: Record<string, unknown>): Promise<void> {
    return this.mutationQueue.run(async () => {
      const api = this.requireApi();
      await api.addOrUpdateAttributes(this.requireUserId(), attributes);
    });
  }

  removeAttributes(keys: string[]): Promise<void> {
    return this.mutationQueue.run(async () => {
      const api = this.requireApi();
      await api.removeAttributes(this.requireUserId(), keys);
    });
  }

  ping(): Promise<void> {
    return this.mutationQueue.run(async () => {
      const api = this.requireApi();
      await api.ping(this.requireUserId());
    });
  }

  triggerEvent(eventName: string, data?: Record<string, unknown>): Promise<string> {
    return this.mutationQueue.run(async () => {
      const api = this.requireApi();
      return api.triggerEvent(this.requireUserId(), eventName, data);
    });
  }

  async trackClick(messageId: string, isForeground?: boolean): Promise<void> {
    this.requireApi();
    await this.clickDispatcher?.enqueueClick({
      messageId,
      isForeground,
      userId: this.userId ?? undefined,
    });
  }

  async getUser(): Promise<MotiSigUser | null> {
    const api = this.requireApi();
    return api.getUser(this.requireUserId());
  }

  /**
   * Removes listeners, clears local user state pointer (does not call server logout).
   */
  reset(): void {
    this.clickDispatcher?.dispose();
    this.clickDispatcher = null;
    this.detachNotificationListeners();
    this.stopForegroundPing();
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.events.clear();
    this.foregroundIds.clear();
    this.foregroundOrder = [];
    this.userId = null;
    this.initialized = false;
    this.api = null;
    this.listenersAttached = false;
    this.lastToken = null;
    this.lastSyncedPermission = null;
    this.pingIntervalMs = DEFAULT_PING_INTERVAL_SEC * 1000;
  }

  private tryPingIfReady(): void {
    if (!this.api || !this.userId) return;
    void this.ping().catch((err) => {
      logger.debug('ping failed', err);
    });
  }

  private startForegroundPing(): void {
    this.stopForegroundPing();
    this.foregroundPingInterval = setInterval(() => {
      this.tryPingIfReady();
    }, this.pingIntervalMs);
  }

  private stopForegroundPing(): void {
    if (this.foregroundPingInterval != null) {
      clearInterval(this.foregroundPingInterval);
      this.foregroundPingInterval = null;
    }
  }

  private requireApi(): MotiSigApi {
    if (!this.api) {
      throw new Error('MotiSig.initialize must be called first');
    }
    return this.api;
  }

  private requireUserId(): string {
    if (!this.userId) {
      throw new Error('No user is set; call setUser first');
    }
    return this.userId;
  }

  private async resolveExpoPushPermission(): Promise<PushSubscriptionPermission> {
    try {
      const { status } = await notifications().getPermissionsAsync();
      if (status === 'granted') return 'granted';
      if (status === 'denied') return 'declined';
      return 'unknown';
    } catch (err) {
      logger.debug('getPermissionsAsync failed', err);
      return 'unknown';
    }
  }

  private async syncExpoPushToken(api: MotiSigApi, userId: string): Promise<void> {
    const token = await this.getExpoPushToken();
    if (!token) return;
    const permission = await this.resolveExpoPushPermission();
    const enabled = this.customerPushEnabled;
    try {
      await api.upsertPushSubscription(userId, {
        devicePlatform: getAppPlatform(),
        pushType: 'expo',
        token,
        permission,
        enabled,
      });
      this.lastSyncedPermission = permission;
    } catch (err) {
      logger.warn('syncExpoPushToken: upsertPushSubscription failed', err);
    }
  }

  private async syncPushSubscriptionPermissionFromForeground(): Promise<void> {
    const api = this.api;
    const userId = this.userId;
    const token = this.lastToken ?? (await this.getExpoPushToken());
    if (!api || !userId || !token) return;
    const permission = await this.resolveExpoPushPermission();
    if (this.lastSyncedPermission === null) return;
    if (permission === this.lastSyncedPermission) return;
    const enabled = this.customerPushEnabled;
    try {
      await api.patchPushSubscription(userId, {
        devicePlatform: getAppPlatform(),
        pushType: 'expo',
        token,
        permission,
        enabled,
      });
      this.lastSyncedPermission = permission;
    } catch (err) {
      logger.debug('syncPushSubscriptionPermissionFromForeground failed', err);
    }
  }

  private attachNotificationListeners(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    this.pushTokenSub = notifications().addPushTokenListener(() => {
      void this.onPushTokenRefresh();
    });

    this.receivedSub = notifications().addNotificationReceivedListener((notification) => {
      const id = notification.request.identifier;
      this.foregroundOrder.push(id);
      this.foregroundIds.add(id);
      if (this.foregroundOrder.length > MAX_FOREGROUND_IDS) {
        const removed = this.foregroundOrder.shift();
        if (removed) this.foregroundIds.delete(removed);
      }
      const data = asDataRecord(notification.request.content.data);
      if (data?.suppressForeground === true) {
        return;
      }
      this.events.emit({
        type: 'foreground_notification',
        notification,
        data,
      });
      this.processNotificationData(data, true);
    });

    this.responseSub = notifications().addNotificationResponseReceivedListener((response) => {
      const id = response.notification.request.identifier;
      const wasForeground = this.foregroundIds.has(id);
      this.foregroundIds.delete(id);
      const idx = this.foregroundOrder.indexOf(id);
      if (idx >= 0) this.foregroundOrder.splice(idx, 1);
      const data = asDataRecord(response.notification.request.content.data);
      this.events.emit({
        type: 'notification_response',
        response,
        data,
        wasForeground,
      });
      this.processNotificationData(data, wasForeground);
    });
  }

  private detachNotificationListeners(): void {
    this.pushTokenSub?.remove();
    this.pushTokenSub = null;
    this.receivedSub?.remove();
    this.receivedSub = null;
    this.responseSub?.remove();
    this.responseSub = null;
    this.listenersAttached = false;
  }

  private async onPushTokenRefresh(): Promise<void> {
    if (this.tokenRefreshBusy) return;
    this.tokenRefreshBusy = true;
    try {
      const newToken = await this.getExpoPushToken();
      if (!newToken) return;
      const previous = this.lastToken;
      if (newToken === previous) return;
      this.lastToken = newToken;
      this.events.emit({
        type: 'token_refresh',
        token: newToken,
        previousToken: previous ?? undefined,
      });
      const userId = this.userId;
      if (!userId || !this.api) return;
      try {
        if (previous) {
          try {
            await this.api.removePushSubscription(userId, {
              devicePlatform: getAppPlatform(),
              pushType: 'expo',
              token: previous,
            });
          } catch (err) {
            logger.warn('token refresh: removePushSubscription failed', err);
          }
        }
        const permission = await this.resolveExpoPushPermission();
        const enabled = this.customerPushEnabled;
        await this.api.upsertPushSubscription(userId, {
          devicePlatform: getAppPlatform(),
          pushType: 'expo',
          token: newToken,
          permission,
          enabled,
        });
        this.lastSyncedPermission = permission;
        this.clickDispatcher?.kick();
      } catch (err) {
        logger.warn('token refresh: upsertPushSubscription failed', err);
      }
    } finally {
      this.tokenRefreshBusy = false;
    }
  }

  private processNotificationData(data: MotiSigNotificationPayload, isForeground: boolean): void {
    const messageId = getMessageId(data);
    if (!messageId || !this.clickDispatcher) return;
    void this.clickDispatcher.enqueueClick({
      messageId,
      isForeground,
      userId: this.userId ?? undefined,
    });
  }
}
