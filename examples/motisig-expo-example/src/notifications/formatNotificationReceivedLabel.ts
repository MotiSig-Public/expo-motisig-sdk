/** Mirrors NotificationReceivedTimeFormat.swift in motisig-ios-example. */
export function formatNotificationReceivedLabel(receivedAt: Date, now: Date): string {
  const ageMs = Math.max(0, now.getTime() - receivedAt.getTime());
  if (ageMs < 60_000) {
    const secs = Math.floor(ageMs / 1000);
    return secs < 1 ? 'Just now' : `${secs}s ago`;
  }
  if (ageMs < 3_600_000) {
    const mins = Math.floor(ageMs / 60_000);
    const secs = Math.floor((ageMs % 60_000) / 1000);
    return `${mins}m ${secs}s ago`;
  }
  return receivedAt.toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}
