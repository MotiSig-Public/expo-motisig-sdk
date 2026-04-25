# Push notifications

`@motisig/expo-motisig-sdk` is the official MotiSig AI JavaScript-only client that uses **`expo-notifications`** for push tokens and delivery callbacks; no separate native MotiSig AI library is required.

## Channels

- **iOS**: APNs via Expo's relay (`pushType: 'expo'`, `devicePlatform: 'ios'`).
- **Android**: FCM via Expo's relay (`pushType: 'expo'`, `devicePlatform: 'android'`).

The MotiSig AI backend speaks Expo natively for this SDK.

## Permissions

`initialize` calls `requestNotificationPermissions()` unless `skipPermissionRequest: true`. You can also call it manually:

```ts
import { requestNotificationPermissions, getNotificationPermissionStatus } from '@motisig/expo-motisig-sdk';

const granted = await requestNotificationPermissions();
const status = await getNotificationPermissionStatus();
```

## Expo push token

```ts
const token = await motisig.getExpoPushToken();
```

Returns the Expo push token string or `null`. Returns `null` on simulators (`expo-device` reports `isDevice === false`) and when the EAS project id cannot be resolved (see [CONFIGURATION.md](CONFIGURATION.md)).

The SDK calls `getExpoPushToken()` for you inside `setUser` and on token refresh.

## Push subscription lifecycle

When a token is known and a user is set, the SDK upserts the subscription via `POST /users/{id}/push-subscriptions`:

```ts
{
  devicePlatform: 'ios' | 'android',
  pushType: 'expo',
  token: '<expo push token>',
  permission: 'granted' | 'declined' | 'unknown',
  enabled: <customer flag>,
}
```

It removes the previous token's subscription before upserting a new one when the token changes.

### `setNotificationEnabled(enabled)`

```ts
await motisig.setNotificationEnabled(false);
```

Customer-controlled flag, persisted via AsyncStorage when installed. Sends `PATCH …/push-subscriptions` with the new `enabled` value. Does **not** change the OS notification permission. `motisig.isNotificationEnabled` returns the current value.

### Permission patch on resume

The SDK subscribes to `AppState`. On every transition to `active`, it reads the OS permission (`getPermissionsAsync`). If the value differs from the last synced one, it sends `PATCH …/push-subscriptions` with the new `permission`. The customer `enabled` flag is **not** inferred from `permission`.

## Listener API

```ts
const unsubscribe = motisig.addListener((event) => {
  switch (event.type) {
    case 'foreground_notification':
      // event.notification, event.data
      break;
    case 'notification_response':
      // event.response, event.data, event.wasForeground
      break;
    case 'token_refresh':
      // event.token, event.previousToken
      break;
  }
});

// later:
unsubscribe();
```

Behavior:

- All listeners receive every event in registration order (no `order` parameter — use the `type` field to filter).
- Foreground notifications carrying `data.suppressForeground === true` skip the `foreground_notification` event but still run click-tracking when applicable.
- The SDK keeps a bounded ring buffer of the last 10 received foreground notification ids so it can decide `wasForeground` on a subsequent tap.

## Cold-start tap handling

`initialize` reads `Notifications.getLastNotificationResponseAsync()` once. If a tap was waiting from a cold start, the SDK runs click tracking using the same code path as live `notification_response` events. You don't need to do anything for this to work.

## Click tracking

`POST /track/click` is sent automatically when:

- a payload contains `messageId` (or `message_id`), **and**
- a user is set, **and**
- the event is a tap (`notification_response`), **or** a foreground delivery (`isForeground: true` is forwarded).

For manual control, call `motisig.trackClick(messageId, isForeground?)`.

## Caveats

- **`fetchDeliveredNotifications`** — not available. Use the `notification_response` event for taps; `expo-notifications` does not surface the platform "delivered list".
- Use `addListener` and remember to call the returned `unsubscribe` function (no weak-reference semantics in JS).

## Rich images

Banner images on iOS require a Notification Service Extension. `@motisig/expo-motisig-sdk` ships a default Objective-C NSE and a config plugin that wires it through [`expo-notification-service-extension-plugin`](https://www.npmjs.com/package/expo-notification-service-extension-plugin). Full recipe: [RICH_IMAGES.md](RICH_IMAGES.md).

On Android, FCM auto-renders the image when the push is sent as a `notification` message with `notification.image`. No extra setup required for the banner.

## Related

- [USER_PROFILE.md](USER_PROFILE.md)
- [PRIVACY_AND_DATA.md](PRIVACY_AND_DATA.md)
- [RICH_IMAGES.md](RICH_IMAGES.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [VERSIONING.md](VERSIONING.md)
