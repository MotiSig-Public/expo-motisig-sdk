# Configuration

## `MotiSig#initialize`

Call once after constructing the client:

```ts
const motisig = new MotiSig();

await motisig.initialize({
  sdkKey: 'your-sdk-key',
  projectId: 'your-project-id',
  baseURL: 'https://api.motisig.ai/client', // optional
  easProjectId: 'uuid',                      // optional
  skipPermissionRequest: false,              // optional
  skipNotificationListeners: false,          // optional
  pingIntervalSeconds: 60,                   // optional
});
```

`initialize` returns `Promise<boolean>` — `false` only if `sdkKey` or `projectId` resolved to an empty string after trimming. Subsequent calls are no-ops once the instance is initialized.

| Option                        | Default                       | Description |
|-------------------------------|-------------------------------|-------------|
| `sdkKey`                      | _required_                    | Project API key. Sent as HTTP header `X-API-Key`. |
| `projectId`                   | _required_                    | Project identifier. Sent as `X-Project-ID`. |
| `baseURL`                     | resolved per `resolveClientBaseUrl` | API base URL. Falls back to `DEFAULT_MOTISIG_BASE_URL` (`https://api.motisig.ai/client`). |
| `easProjectId`                | `Constants.expoConfig?.extra?.eas?.projectId` | EAS project UUID required by `Notifications.getExpoPushTokenAsync`. |
| `skipPermissionRequest`       | `false`                       | When `true`, skip `requestNotificationPermissions()` during init. |
| `skipNotificationListeners`   | `false`                       | When `true`, do not attach `expo-notifications` listeners. The SDK then runs HTTP-only. |
| `pingIntervalSeconds`         | `60`                          | Foreground heartbeat interval. Clamped to `1…86400`; non-finite or non-positive values fall back to 60. |

## EAS project id

Expo push tokens require an EAS project id. The SDK resolves it from, in order:

1. `options.easProjectId`
2. `Constants.expoConfig?.extra?.eas?.projectId` (read from `app.json` / `app.config.*`)

If neither is available, `motisig.getExpoPushToken()` returns `null` and no push subscription is uploaded — the rest of the SDK still works (REST + listener emitter).

The included Expo config plugin ([`app.plugin.js`](../app.plugin.js)) warns at prebuild time if the EAS project id is missing.

## Default base URL

`DEFAULT_MOTISIG_BASE_URL` exported from the package: `https://api.motisig.ai/client`.

## Environment variables

The Expo bundler does not inject arbitrary env vars; use Expo's `EXPO_PUBLIC_*` convention so they are available at runtime:

```bash
EXPO_PUBLIC_MOTISIG_SDK_KEY=...
EXPO_PUBLIC_MOTISIG_PROJECT_ID=...
```

```ts
await motisig.initialize({
  sdkKey: process.env.EXPO_PUBLIC_MOTISIG_SDK_KEY!,
  projectId: process.env.EXPO_PUBLIC_MOTISIG_PROJECT_ID!,
});
```

The example app demonstrates the wiring; see [`examples/motisig-expo-example/.env.example`](../examples/motisig-expo-example).

## Runtime state

- `motisig.isInitialized` — `true` after a successful `initialize`.
- `motisig.currentUserId` — current user id (after `setUser`), or `null`.
- `motisig.isNotificationEnabled` — current customer-controlled push flag (persisted with `@react-native-async-storage/async-storage` when installed).

## Customer push preference

The customer-`enabled` flag is loaded from AsyncStorage (when present) at init time. If AsyncStorage is not installed in the host app, the value defaults to `true` and is held in-memory only.

## Lower-level clients

If you only need REST without notifications, use `createMotiSigApi`:

```ts
import { createMotiSigApi } from '@motisig/expo-motisig-sdk';

const api = createMotiSigApi({
  baseUrl: 'https://api.motisig.ai/client',
  sdkKey: '...',
  projectId: '...',
});
```

`MotiSigHttpClient` is also exported for fully custom transports.

## Related

- [GETTING_STARTED.md](GETTING_STARTED.md)
- [USER_PROFILE.md](USER_PROFILE.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
