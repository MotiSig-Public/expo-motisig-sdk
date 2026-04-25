# MotiSig AI — Official Expo SDK

> npm package: `@motisig/expo-motisig-sdk`
>
> Official SDK from [MotiSig AI](https://motisig.ai).

Official **MotiSig AI** client for **Expo** and **React Native**, written in TypeScript. Uses **`expo-notifications`** for Expo push tokens and delivery callbacks; ships as a JavaScript-only package — no extra native module to link.

## Requirements

- **Expo SDK 52+** (tested with 52 in the library dev environment; the example app uses SDK 54).
- **Peer dependencies:** `expo`, `expo-notifications`, `expo-constants`, `expo-device`, `react-native`.
- **Physical device** for `getExpoPushToken()` (Expo reports tokens are not available on simulators).
- **`extra.eas.projectId`** in `app.json` / app config (UUID from [expo.dev](https://expo.dev)), required by `Notifications.getExpoPushTokenAsync`.

Use a **development build** or **EAS Build** for reliable push (`expo run:ios` / `expo run:android` after prebuild), not Expo Go, once you add the `expo-notifications` config plugin.

## Install

```bash
pnpm add @motisig/expo-motisig-sdk expo-notifications expo-constants expo-device
```

(`npm install` / `yarn add` work too; this repo uses **pnpm** for development.)

## Quick start

```ts
import { MotiSig } from '@motisig/expo-motisig-sdk';

const motiSig = new MotiSig();

await motiSig.initialize({
  sdkKey: 'YOUR_SDK_KEY',
  projectId: 'YOUR_MOTISIG_PROJECT_ID',
  // baseURL: 'https://api.motisig.ai/client', // optional
  // easProjectId: 'uuid', // optional if already in app.json extra.eas.projectId
});

await motiSig.setUser('user-123'); // POST /users (409 ignored), then upserts Expo push subscription

motiSig.addListener((event) => {
  if (event.type === 'foreground_notification') {
    console.log('data', event.data);
  }
});
```

## API

### `MotiSig`

| Method | Description |
|--------|-------------|
| `initialize(options)` | Configures HTTP client; requests notification permission unless `skipPermissionRequest`; attaches listeners unless `skipNotificationListeners`; handles cold-start notification response. |
| `getExpoPushToken()` | Returns Expo push token string or `null`. |
| `setUser(id, extras?)` | Registers user (`POST /users`), tolerates **409**, sets local user, upserts Expo push subscription (`POST …/push-subscriptions`). |
| `logout()` | Removes push subscription for current user (`DELETE …/push-subscriptions`, best effort). |
| `setNotificationEnabled(enabled)` | Customer flag for this device; persists (via `@react-native-async-storage/async-storage` when installed) and `PATCH`es subscription `enabled`. |
| `updateUser`, `addTags`, `removeTags`, `addOrUpdateAttributes`, `removeAttributes`, `ping`, `triggerEvent` | User-scoped MotiSig AI routes; require `setUser` first. |
| `trackClick(messageId, isForeground?)` | `POST /track/click`. |
| `getUser()` | `GET /users/{id}` for current user. |
| `addListener(fn)` | Emits `foreground_notification`, `notification_response`, `token_refresh`. |
| `removeAllListeners()` / `reset()` | Clears listeners; `reset` also tears down native subscriptions and clears init state. |

### Lower-level

- **`MotiSigApi`** / **`createMotiSigApi`** — REST-only client (no notifications).
- **`MotiSigHttpClient`** — fetch wrapper with `X-API-Key` and `X-Project-ID`.

### Rich notification images

Banner images need a **Notification Service Extension (NSE)** on iOS — Expo Go does not ship one. Add the SDK config plugin to your `app.json` with `nse.enabled: true` and the SDK will register [`expo-notification-service-extension-plugin`](https://www.npmjs.com/package/expo-notification-service-extension-plugin) for you with a bundled `NotificationService.m`:

```json
{
  "expo": {
    "plugins": [
      ["@motisig/expo-motisig-sdk/app.plugin", {
        "nse": {
          "enabled": true,
          "mode": "production",
          "devTeam": "YOUR_TEAM_ID",
          "iPhoneDeploymentTarget": "16.0"
        }
      }]
    ]
  }
}
```

Override the bundled NSE with `nse.iosNSEFilePath` if you need custom logic. Set `nse.stripAppGroups: true` if your Apple Developer profile does not allow App Groups (the underlying community plugin always adds them). Send pushes with `mutableContent: true` and `_motisig.imageUrl` (or `_richContent.image` via Expo's push relay).

On Android, FCM auto-renders the image when the push is sent as a `notification` message with `notification.image` — no extra setup.

Full Xcode-free walkthrough, plugin config, payload contract, and troubleshooting: **[docs/RICH_IMAGES.md](docs/RICH_IMAGES.md)**.

Don't forget `Notifications.setNotificationHandler({...})` so foreground banners actually appear; the example app at [`examples/motisig-expo-example`](examples/motisig-expo-example) wires it all up.

## Documentation

| Guide | Description |
|-------|-------------|
| [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) | Lifecycle, foreground handler, ordered mutations |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Init options, base URL, EAS project id, env vars |
| [docs/USER_PROFILE.md](docs/USER_PROFILE.md) | `setUser`, `updateUser`, `logout`, `reset` |
| [docs/EVENTS_TAGS_ATTRIBUTES.md](docs/EVENTS_TAGS_ATTRIBUTES.md) | Tags, attributes, `ping`, `triggerEvent`, click tracking |
| [docs/PUSH_NOTIFICATIONS.md](docs/PUSH_NOTIFICATIONS.md) | Expo push tokens, listeners, permissions |
| [docs/RICH_IMAGES.md](docs/RICH_IMAGES.md) | iOS NSE setup, payload contract, Android notes |
| [docs/PRIVACY_AND_DATA.md](docs/PRIVACY_AND_DATA.md) | Data categories for your privacy disclosures |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Symptom-driven debugging checklist |
| [docs/VERSIONING.md](docs/VERSIONING.md) | Versioning policy and the canonical push payload contract |

## Example

See [examples/motisig-expo-example](examples/motisig-expo-example).

## Build this repo

Uses [pnpm](https://pnpm.io/) workspaces (`pnpm-workspace.yaml`: SDK root + `examples/*`).

```bash
corepack enable
pnpm install
pnpm run build
```

From the repo root, start the example app:

```bash
pnpm example:start
```

Output is CommonJS in `dist/` for broad React Native compatibility.

## Source layout (`src/`)

| Folder | Role |
|--------|------|
| `client/` | Main [`MotiSig`](src/client/MotiSig.ts) class |
| `api/` | HTTP transport and [`MotiSigApi`](src/api/motiSigApi.ts) |
| `types/` | Public TypeScript types |
| `expo/` | Expo-specific helpers (e.g. notification permissions) |
| `runtime/` | React Native runtime helpers (e.g. app platform) |
| `internal/` | Emitter, async mutation queue, optional AsyncStorage-backed push preference |
| `constants/` | Defaults such as base URL |
| `errors/` | Error classes |

## Notes

- Push uses **Expo push tokens** (`expo` channel on the API).
- No `fetchDeliveredNotifications` helper — reconcile via the `notification_response` event when the user taps.
- Cold start and taps go through `expo-notifications` APIs.

## License

MIT — see [LICENSE](LICENSE).
