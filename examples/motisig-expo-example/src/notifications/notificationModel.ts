import type { Notification } from 'expo-notifications';
import { logPushIngest } from './pushNotificationDebugLog';

export type NotificationListItem = {
  id: string;
  messageId: string | null;
  title: string | null;
  body: string | null;
  userInfo: Record<string, unknown>;
  receivedInForeground: boolean;
  requestIdentifier: string | null;
  sourcedFromDeliveredCenter: boolean;
  receivedAt: Date;
};

function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getMessageIdFromData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const raw = data.messageId ?? data.message_id;
  return typeof raw === 'string' ? raw : null;
}

function mergePushImageMetadata(
  content: Notification['request']['content'],
  trigger: Notification['request']['trigger'],
  base: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };

  if (trigger && typeof trigger === 'object' && 'type' in trigger && trigger.type === 'push') {
    const remoteMessage = (trigger as { remoteMessage?: { notification?: { imageUrl?: string | null } } })
      .remoteMessage;
    const imageUrl = remoteMessage?.notification?.imageUrl;
    if (
      typeof imageUrl === 'string' &&
      imageUrl.length > 0 &&
      out.image == null &&
      out.imageUrl == null &&
      out.image_url == null &&
      out.fcm_notification_image_url == null
    ) {
      out.fcm_notification_image_url = imageUrl;
    }
  }

  const attachments = (content as { attachments?: unknown }).attachments;
  if (Array.isArray(attachments)) {
    attachments.forEach((att, index) => {
      if (!att || typeof att !== 'object') return;
      const url = (att as { url?: unknown }).url;
      if (typeof url !== 'string' || url.length === 0) return;
      const key = `ios_attachment_${index}_url`;
      if (out[key] == null) out[key] = url;
    });
  }

  return out;
}

export function fromExpoNotification(
  notification: Notification,
  flags: { receivedInForeground: boolean; sourcedFromDeliveredCenter: boolean },
): Omit<NotificationListItem, 'id'> {
  const content = notification.request.content;
  const dataRecord =
    content.data && typeof content.data === 'object' && !Array.isArray(content.data)
      ? (content.data as Record<string, unknown>)
      : {};
  let userInfo = mergePushImageMetadata(content, notification.request.trigger, dataRecord);
  // NSE may inject `_motisigNseDebug` into APNs `userInfo`; on iOS Expo sometimes surfaces it on `trigger.payload` only.
  const tr = notification.request.trigger;
  if (
    userInfo._motisigNseDebug == null &&
    tr &&
    typeof tr === 'object' &&
    'type' in tr &&
    tr.type === 'push'
  ) {
    const payload = (tr as { payload?: Record<string, unknown> }).payload;
    const d = payload?._motisigNseDebug;
    if (d != null) {
      userInfo = { ...userInfo, _motisigNseDebug: d };
    }
  }
  const dateMs = notification.date;
  const receivedAt =
    typeof dateMs === 'number' && !Number.isNaN(dateMs) ? new Date(dateMs) : new Date();
  return {
    messageId: getMessageIdFromData(dataRecord),
    title: typeof content.title === 'string' ? content.title : null,
    body: typeof content.body === 'string' ? content.body : null,
    userInfo,
    receivedInForeground: flags.receivedInForeground,
    requestIdentifier: notification.request.identifier ?? null,
    sourcedFromDeliveredCenter: flags.sourcedFromDeliveredCenter,
    receivedAt,
  };
}

export function sortNotifications(items: NotificationListItem[]): NotificationListItem[] {
  return [...items].sort((a, b) => {
    const t = b.receivedAt.getTime() - a.receivedAt.getTime();
    if (t !== 0) return t;
    return b.id.localeCompare(a.id);
  });
}

export function mergePresentedIntoList(
  current: NotificationListItem[],
  presented: Notification[],
): NotificationListItem[] {
  const known = new Set(
    current.map((x) => x.requestIdentifier).filter((r): r is string => !!r && r.length > 0),
  );
  const additions: NotificationListItem[] = [];
  for (const n of presented) {
    const rid = n.request.identifier;
    if (!rid || known.has(rid)) continue;
    known.add(rid);
    const item: NotificationListItem = {
      id: newId(),
      ...fromExpoNotification(n, {
        receivedInForeground: false,
        sourcedFromDeliveredCenter: true,
      }),
    };
    additions.push(item);
    logPushIngest('presented', item, false, n);
  }
  return sortNotifications([...current, ...additions]);
}

/** Insert if unknown by requestIdentifier; otherwise return existing item (iOS dedupe). */
export function upsertFromListener(
  current: NotificationListItem[],
  notification: Notification,
  flags: { receivedInForeground: boolean; sourcedFromDeliveredCenter: boolean },
): { next: NotificationListItem[]; item: NotificationListItem } {
  const rid = notification.request.identifier;
  if (rid) {
    const existing = current.find((x) => x.requestIdentifier === rid);
    if (existing) {
      return { next: current, item: existing };
    }
  }
  const item: NotificationListItem = {
    id: newId(),
    ...fromExpoNotification(notification, flags),
  };
  return { next: sortNotifications([...current, item]), item };
}
