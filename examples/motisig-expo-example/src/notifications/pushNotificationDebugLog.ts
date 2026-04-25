import type { Notification } from 'expo-notifications';

import { extractPushImageUrl } from './extractPushImageUrl';
import type { NotificationListItem } from './notificationModel';

/** iOS: Expo exposes full `userInfo` under `trigger.payload` (may include `aps`). */
function extractIosPushDebug(notification: Notification | undefined): {
  iosAttachmentCount: number | null;
  apsMutableContent: string | null;
} {
  if (!notification) {
    return { iosAttachmentCount: null, apsMutableContent: null };
  }
  const raw = notification.request.content as { attachments?: unknown };
  const atts = raw.attachments;
  const count = Array.isArray(atts) ? atts.length : 0;

  const t = notification.request.trigger;
  if (!t || typeof t !== 'object' || !('type' in t) || t.type !== 'push') {
    return { iosAttachmentCount: count, apsMutableContent: null };
  }
  const payload = (t as { payload?: Record<string, unknown> }).payload;
  if (!payload || typeof payload !== 'object') {
    return { iosAttachmentCount: count, apsMutableContent: 'no_payload' };
  }
  const aps = payload.aps;
  if (!aps || typeof aps !== 'object' || Array.isArray(aps)) {
    return { iosAttachmentCount: count, apsMutableContent: 'no_aps' };
  }
  const mc = (aps as Record<string, unknown>)['mutable-content'];
  return {
    iosAttachmentCount: count,
    apsMutableContent: mc === undefined ? 'missing' : String(mc),
  };
}

function imageKeysSample(userInfo: Record<string, unknown>): string {
  const parts: string[] = [];
  const rc = userInfo._richContent;
  if (rc && typeof rc === 'object' && !Array.isArray(rc)) {
    parts.push(`_richContent.image=${(rc as Record<string, unknown>).image ?? 'nil'}`);
  }
  const fcm = userInfo.fcm_options;
  if (fcm && typeof fcm === 'object' && !Array.isArray(fcm)) {
    parts.push(`fcm_options.image=${(fcm as Record<string, unknown>).image ?? 'nil'}`);
  }
  for (const key of ['image', 'imageUrl', 'image_url', 'fcm_notification_image_url', 'gcm.notification.image']) {
    if (key in userInfo) parts.push(`${key}=${String(userInfo[key])}`);
  }
  for (const key of Object.keys(userInfo).sort()) {
    if (key.startsWith('ios_attachment_') && key.endsWith('_url')) {
      parts.push(`${key}=${String(userInfo[key])}`);
    }
  }
  return parts.length === 0 ? '{}' : `{${parts.join(', ')}}`;
}

function rawUserInfoJson(userInfo: Record<string, unknown>): string {
  try {
    return JSON.stringify(userInfo, null, 2);
  } catch {
    return String(userInfo);
  }
}

/** Compact trail from NSE-injected `userInfo._motisigNseDebug` (array of JSON-serializable rows). */
function summarizeNseDebug(raw: unknown): string | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const parts: string[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const ev = r.event;
    if (ev === 'download_response') {
      parts.push(`download_response(status=${String(r.status)},mime=${String(r.mime ?? '')})`);
    } else if (ev === 'attach_ok') {
      parts.push(`attach_ok(typeHint=${String(r.typeHint ?? '')},mime=${String(r.mime ?? '')})`);
    } else if (ev === 'attach_error') {
      parts.push(`attach_error(${String(r.error ?? '')})`);
    } else if (ev === 'download_error') {
      parts.push(`download_error(${String(r.error ?? '')})`);
    } else if (ev === 'reject_status') {
      parts.push(`reject_status(${String(r.status)})`);
    } else if (ev === 'reject_mime') {
      parts.push(`reject_mime(mime=${String(r.mime ?? '')},ext=${String(r.ext ?? '')})`);
    } else if (ev === 'move_error') {
      parts.push(`move_error(${String(r.error ?? '')})`);
    } else {
      parts.push(String(ev ?? '?'));
    }
  }
  return parts.join(' | ');
}

function nseDebugPayload(
  item: NotificationListItem,
  rawNotification?: Notification,
): { nseDebug: string | undefined; nseRaw: unknown } {
  const fromItem = item.userInfo._motisigNseDebug;
  const data = rawNotification?.request?.content?.data;
  const fromRaw =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)._motisigNseDebug
      : undefined;
  const nseRaw = fromItem !== undefined && fromItem !== null ? fromItem : fromRaw;
  return { nseDebug: summarizeNseDebug(nseRaw), nseRaw };
}

/** Logs merged userInfo the same way detail screen resolves images (post-`fromExpoNotification`). */
export function logPushIngest(
  source: 'listener' | 'delivered' | 'presented',
  item: NotificationListItem,
  inForeground: boolean | null | undefined,
  /** When set, logs iOS `aps.mutable-content` and native attachment count (plan: confirm NSE eligibility without Console.app). */
  rawNotification?: Notification,
): void {
  const resolved = extractPushImageUrl(item.userInfo) ?? 'nil';
  const fg = inForeground === undefined || inForeground === null ? 'n/a' : String(inForeground);
  const title = (item.title ?? '').slice(0, 80);
  const { iosAttachmentCount, apsMutableContent } = extractIosPushDebug(rawNotification);
  const { nseDebug, nseRaw } = nseDebugPayload(item, rawNotification);
  console.log('[MotiSigExample]', {
    pushIngest: true,
    source,
    inForeground: fg,
    messageId: item.messageId,
    title,
    body: item.body,
    resolvedImageUrl: resolved,
    imageKeysSample: imageKeysSample(item.userInfo),
    iosAttachmentCount,
    apsMutableContent,
    nseDebug,
    nseRaw,
    rawUserInfo: item.userInfo,
    rawUserInfoJson: rawUserInfoJson(item.userInfo),
  });
}
