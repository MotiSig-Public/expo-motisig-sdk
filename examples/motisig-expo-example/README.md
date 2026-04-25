# motisig-expo-example

Minimal app demonstrating [@motisig/expo-motisig-sdk](../../README.md).

## Prerequisites

1. **App identifiers** — `ios.bundleIdentifier` and `android.package` in [`app.json`](./app.json) are placeholders (`com.example.motisigexpoexample`). Replace both with identifiers you control before building.
2. **EAS project ID** — Replace the empty `expo.extra.eas.projectId` in `app.json` with your project UUID from [expo.dev](https://expo.dev) (or run `eas init` in this folder and merge the generated id).
3. **MotiSig AI keys** — Create a `.env` file (Expo loads `EXPO_PUBLIC_*` at bundle time):

```bash
EXPO_PUBLIC_MOTISIG_SDK_KEY=your-sdk-key
EXPO_PUBLIC_MOTISIG_PROJECT_ID=your-motisig-project-id
```

4. **Physical device** — Expo push tokens are not available on iOS Simulator.

## Run

From the **repository root** (pnpm workspace). This package pins **`pnpm@10.33.0`** (same as the SDK root); use Corepack so the version matches:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install
pnpm --filter motisig-expo-example start
```

Or from this directory after a root `pnpm install`:

```bash
pnpm start
```

For full push behavior use a **development build** (`npx expo run:ios` / `npx expo run:android` or EAS Build), not Expo Go, after `expo-notifications` native setup.

**iOS banner images** — This example registers `@motisig/expo-motisig-sdk/app.plugin` in `app.json` with `nse.enabled: true` and `stripAppGroups: true`. The SDK plugin pulls in [`expo-notification-service-extension-plugin`](https://www.npmjs.com/package/expo-notification-service-extension-plugin) as a transitive dependency and ships its own `NotificationService.m`, so there's no need to copy the NSE source or provision App Groups for the placeholder bundle id. `src/App.tsx` calls `Notifications.setNotificationHandler` so foreground banners show. See [`docs/RICH_IMAGES.md`](../../docs/RICH_IMAGES.md) for the full reference.

## Try `setUser`

Uncomment or add in `src/App.tsx` after successful `initialize`:

```ts
await motiSig.setUser('your-test-user-id');
```

This registers the user with the MotiSig API and uploads the Expo push token when available.
