# Rich notification images (Expo)

Image banners behave very differently on iOS and Android. This page covers both, with the canonical payload contract that lights up images on every platform.

## How each platform handles images

| Platform | What happens out of the box | What you need to do |
|----------|------------------------------|----------------------|
| **iOS** | iOS does **not** download remote URLs. Without a Notification Service Extension (NSE), banners render text-only. | Add the SDK's config plugin with `nse.enabled: true` (see below). The SDK pulls in [`expo-notification-service-extension-plugin`](https://www.npmjs.com/package/expo-notification-service-extension-plugin) and ships a default `NotificationService.m`. Server must send `mutableContent: true`. |
| **Android** | FCM auto-renders images for `notification` messages with `notification.image` while the app is in the background. | Nothing for the banner. For data-only messages, render your own `BigPictureStyle` notification (or use the Android SDK directly if you go bare React Native). |

This page focuses on iOS because that's where the work is.

## iOS NSE setup

`@motisig/expo-motisig-sdk` ships a default Objective-C NSE (`native/ios/NotificationService/NotificationService.m`) and a config plugin that wires it through [`expo-notification-service-extension-plugin`](https://www.npmjs.com/package/expo-notification-service-extension-plugin) (declared as a dependency, no separate install needed).

### 1. Register the SDK config plugin in `app.json` / `app.config.*`

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.yourcompany.yourapp",
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    },
    "plugins": [
      ["@motisig/expo-motisig-sdk/app.plugin", {
        "nse": {
          "enabled": true,
          "mode": "production",
          "devTeam": "YOUR_TEAM_ID",
          "iPhoneDeploymentTarget": "16.0"
        }
      }],
      ["expo-notifications", { "icon": "./assets/icon.png", "color": "#ffffff" }]
    ]
  }
}
```

`nse.*` props:

| Key | Default | Notes |
|-----|---------|-------|
| `enabled` | `false` | Set to `true` to install the NSE. |
| `mode` | `'production'` | `'development'` for local `expo run:ios` / dev clients (sandbox APNs); `'production'` for TestFlight / App Store. A mismatch can prevent the NSE from running. |
| `devTeam` | – | Apple Developer Team ID for signing the NSE target. Required for device builds. |
| `iPhoneDeploymentTarget` | community-plugin default | iPhone deployment target for the NSE target. |
| `iosNSEFilePath` | bundled SDK file | Absolute or project-relative path to override the bundled `NotificationService.m`. |
| `stripAppGroups` | `false` | Remove `com.apple.security.application-groups` from main app + NSE entitlements. Enable if your Apple Developer profile does not allow App Groups; the community plugin always adds them since it's a OneSignal-derived fork. |

### 2. (Optional) Override the bundled NSE

The bundled implementation handles `_motisig.imageUrl` / `_richContent.image` / `fcm_options.image`, MIME checks, and a `_motisigNseDebug` log surfaced in `userInfo`. If you need custom behavior, copy the source from `node_modules/@motisig/expo-motisig-sdk/native/ios/NotificationService/NotificationService.m` into your app (for example `./notification-service/NotificationService.m`, **outside** `ios/` so `expo prebuild --clean` does not delete it) and point `nse.iosNSEFilePath` at it.

### 3. Foreground banners (recommended)

Without this, iOS may suppress the banner while your app is open. Call once at startup (e.g. at the top of `App.tsx`):

```ts
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

### 4. Build

Run `npx expo prebuild --platform ios` (or `--clean`), then `npx expo run:ios --device` or an EAS iOS build. **Expo Go does not include your NSE** — use a development or production build.

## Image URL resolution order

The reference NSE returns the first non-empty match from:

1. `_motisig.imageUrl` / `_motisig.image_url` / `_motisig.image` (MotiSig AI canonical)
2. `_richContent.image` (Expo push relay — what you get when sending via the Expo push API)
3. `fcm_options.image` (FCM relay)
4. Top-level `image` / `imageUrl` / `image_url` (host-app convenience)
5. Sorted `ios_attachment_*_url` (legacy compat)

A single server payload with `_motisig.imageUrl` lights up images wherever the right delivery setup is in place.

Image URLs must be **HTTPS** and reachable from the NSE process (no auth headers, no signed-cookie schemes that depend on the host app). If your CDN requires auth, sign the URL itself (query-string token).

## Server payload (Expo push)

```json
{
  "to": "ExponentPushToken[...]",
  "title": "Hello",
  "body": "world",
  "mutableContent": true,
  "data": {
    "messageId": "f082aa55-6eed-407f-b819-36e858ed7d0a",
    "_motisig": { "imageUrl": "https://your-cdn.example.com/path/push.jpg" }
  }
}
```

Expo's push relay forwards this to APNs with `mutable-content: 1` and to FCM as a data-only message.

## Troubleshooting

| Symptom | What to check |
|---------|---------------|
| NSE never runs | Server sends **`mutableContent: true`**; on device, `expo-notifications` payload should show **`apsMutableContent`** / mutable-content for that push. |
| NSE runs, no image | Image URL under one of the resolved keys above; URL must be **HTTPS** and publicly readable (e.g. not 403). |
| Background OK, foreground no banner | `Notifications.setNotificationHandler` not called (step 4). |
| Download fails / NSE silent | If your NSE writes events into **`userInfo._motisigNseDebug`** (as the reference does), they appear in the JS `notification_response` event payload. As a fallback, open **Console.app** on macOS, select your iPhone, filter subsystem **`ai.motisig.sdk.expo`**, and re-send the push. |
| `mode: production` build still uses dev APNs | The plugin's `mode` controls the NSE's APNs environment. Switch to `mode: development` for local `expo run:ios`. |
| Android banner missing image | Send the push as an FCM `notification` message with `notification.image`, or render your own `BigPictureStyle` notification from a custom `FirebaseMessagingService` (requires bare RN). |

**Reference NSE log events**: `entered` → NSE invoked; `no_url` → missing image key; `reject_status` → non-200 HTTP; `reject_mime` → disallowed `Content-Type`; `attach_ok` / `attach_error` → attachment result; `time_will_expire` → budget exceeded. Each step is mirrored to Console.app under subsystem `ai.motisig.sdk.expo`.

**Console verbosity** (optional): on the Notification Service Extension target, add **`MotiSigNSEConsoleLogLevel`** to its **Info.plist** (string or integer). Values: `silent` / `0` — no `os_log` lines; `error` / `1` — failures only (**default** when the key is omitted); `info` / `2` — high-signal lines plus errors (skips per-download URL and HTTP status/mime logs); `debug` / `3` — full detail. The `_motisigNseDebug` array in `userInfo` is always written regardless of this setting.

The example app at [`examples/motisig-expo-example`](../examples/motisig-expo-example) wires the plugin and foreground handler end-to-end; see [`examples/motisig-expo-example/app.json`](../examples/motisig-expo-example/app.json) and [`examples/motisig-expo-example/src/App.tsx`](../examples/motisig-expo-example/src/App.tsx).

## Related

- [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [VERSIONING.md](VERSIONING.md)
