const ORDERED_KEYS = [
  'image',
  'imageUrl',
  'image_url',
  'fcm_notification_image_url',
  'gcm.notification.image',
] as const;

function pushNestedImageCandidates(userInfo: Record<string, unknown>): string[] {
  const out: string[] = [];
  const rc = userInfo._richContent;
  if (rc && typeof rc === 'object' && !Array.isArray(rc)) {
    const img = (rc as Record<string, unknown>).image;
    if (typeof img === 'string' && img.length > 0) out.push(img);
  }
  const fcm = userInfo.fcm_options;
  if (fcm && typeof fcm === 'object' && !Array.isArray(fcm)) {
    const img = (fcm as Record<string, unknown>).image;
    if (typeof img === 'string' && img.length > 0) out.push(img);
  }
  return out;
}

/** First HTTP(S) URL from common push payload keys or `ios_attachment_*_url` (merged in `fromExpoNotification`). */
export function extractPushImageUrl(userInfo: Record<string, unknown>): string | null {
  const candidates: string[] = [];
  candidates.push(...pushNestedImageCandidates(userInfo));
  for (const k of ORDERED_KEYS) {
    const v = userInfo[k];
    if (typeof v === 'string') candidates.push(v);
  }
  for (const k of Object.keys(userInfo).sort()) {
    if (k.startsWith('ios_attachment_') && k.endsWith('_url')) {
      const v = userInfo[k];
      if (typeof v === 'string') candidates.push(v);
    }
  }
  for (const raw of candidates) {
    const t = raw.trim();
    if (t.startsWith('https://') || t.startsWith('http://')) return t;
  }
  return null;
}
