export async function requestNotificationPermissions(): Promise<boolean> {
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.status === 'granted';
}

export async function getNotificationPermissionStatus(): Promise<
  import('expo-notifications').PermissionStatus
> {
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  const r = await Notifications.getPermissionsAsync();
  return r.status;
}
