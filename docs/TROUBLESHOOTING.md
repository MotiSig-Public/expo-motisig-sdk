# Troubleshooting

Symptoms grouped by area. Set `EXPO_PUBLIC_DEBUG=1` (or your equivalent log gate) and tail the Metro console — every `MotiSig*` error throws through the public promise, so a missing `await ... .catch(...)` will silently drop failures.

## Initialization

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `initialize` returns `false` | `sdkKey` or `projectId` was empty (after trimming). | Pass non-empty strings; verify `EXPO_PUBLIC_*` env vars are exposed to the bundle. |
| Subsequent `initialize` calls do nothing | The instance is already initialized. | Construct a new `MotiSig()` after `reset()` if you really need to re-initialize. |
| HTTP requests go to the wrong host | `baseURL` not passed and `resolveClientBaseUrl` fell back to the default. | Pass `baseURL` explicitly, or set the override your `resolveClientBaseUrl` reads from. |
| `401` / `403` on every request | Wrong `sdkKey` for the target environment. | Confirm key matches the project. Each request sends `X-API-Key` and `X-Project-ID`. |

## Push tokens

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `getExpoPushToken()` returns `null` on simulator | `expo-device` reports `isDevice === false`. | Test on a physical device. |
| `getExpoPushToken()` returns `null` on device | EAS project id missing. | Add `extra.eas.projectId` in `app.json` (or pass `easProjectId` to `initialize`). The included `app.plugin.js` warns at prebuild time. |
| Push token never refreshes | Your app revoked notification permission. | Re-grant in Settings; the SDK syncs `permission` on the next foreground transition. |
| Push subscription not removed on logout | No token was ever obtained for this user. | Without a token, there's nothing to remove server-side. |

## User and mutations

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Error('No user is set; call setUser first')` | A user-scoped method was called before `setUser`. | `await motisig.setUser(...)` before any mutation. |
| `MotiSigApiError` with `409` on `setUser` | Server already has the user id. | Expected — the SDK swallows this and persists locally. If you see a thrown `409`, inspect the rest of the stack; the swallow is in `setUser` only. |
| Mutations resolve in unexpected order | Two `await`s started concurrently from different code paths. | The `AsyncQueue` serializes by enqueue order. If you start two promises in parallel without `await`, the queue still serializes them — but the order is whichever `run()` was called first. Await sequentially when order matters. |

## Notifications and listeners

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `addListener` fires nothing | `skipNotificationListeners: true` was passed to `initialize`. | Re-init without that flag, or call the lower-level `MotiSigEmitter` if you want HTTP-only mode. |
| `notification_response` not firing on cold start | `Notifications.getLastNotificationResponseAsync()` returned `null` (no pending tap), or the host app reset the response cache. | Confirm with `await Notifications.getLastNotificationResponseAsync()` from your own code; the SDK calls it once during `initialize`. |
| `wasForeground` always `false` | App was killed between receiving the notification and the user tapping it; the foreground id ring buffer doesn't survive process death. | Expected. Use `wasForeground` only as a hint, not as authoritative state. |
| Foreground banner never shows | `Notifications.setNotificationHandler` not called. | Add it before `App` renders. See [GETTING_STARTED.md](GETTING_STARTED.md). |
| Click tracking never fires | Payload missing `messageId`, no user set, or the listener is suppressing via `data.suppressForeground`. | Verify payload, ensure `setUser` ran, check the data shape. |

## Rich notification images

See [RICH_IMAGES.md](RICH_IMAGES.md) for the full checklist. Most common failures:

- Missing `expo-notification-service-extension-plugin` in `app.json`.
- Wrong `mode` (`development` vs `production`) for the build channel.
- Image URL not HTTPS or returns `403`/`404`.
- `Notifications.setNotificationHandler` missing → no foreground banner.
- Trying to test in **Expo Go**, which does not include your NSE.

## Build and tooling

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `pnpm install` complains about peer deps | The SDK declares `expo`, `expo-notifications`, `expo-constants`, `expo-device`, `react-native` as peers. | Add the missing ones to your app's dependencies. |
| `require('./client/MotiSig')` errors at import | Your bundler tree-shook the `Proxy` shim. | Import from the package root (`import { MotiSig } from '@motisig/expo-motisig-sdk'`), not from a deep path. |
| `expo prebuild --clean` deleted my NSE | The NSE source lives under `ios/` and was overwritten. | Move `NotificationService.m` to a project-root folder (`./notification-service/`) and point the plugin at it. |

## Related

- [GETTING_STARTED.md](GETTING_STARTED.md)
- [CONFIGURATION.md](CONFIGURATION.md)
- [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md)
- [RICH_IMAGES.md](RICH_IMAGES.md)
