# Privacy and data

This page summarizes **what kinds of data the SDK is designed to send** so you can complete your product privacy disclosures (App Store privacy labels, Google Play data safety form, your in-app privacy policy). It is **not legal advice**.

## Data the SDK may send to your MotiSig AI backend

- **Credentials and routing:** API key (`X-API-Key`), project id (`X-Project-ID`), and requests to your configured base URL.
- **User identity:** The string id you pass to `setUser`, plus profile fields you send with `updateUser` (for example `firstName`, `lastName`, `email`).
- **Device and locale context:** `Intl.DateTimeFormat().resolvedOptions().timeZone` and `.locale` are included with registration and profile updates. `platform` (`ios` / `android` / `web`) is auto-detected via `getAppPlatform()`.
- **Push subscription:** Expo push token plus `devicePlatform`, `pushType: "expo"`, optional **permission** (`granted` / `declined` / `unknown`), and customer **enabled** flag, sent to push-subscription upsert / patch / remove endpoints.
- **Tags and attributes:** Arbitrary strings and key-value attributes you supply.
- **Events:** Event names and optional JSON-compatible payloads from `triggerEvent`.
- **Notifications:** Payload-derived fields (such as `messageId`) are echoed back in click-tracking calls (`POST /track/click`).
- **Heartbeat:** A periodic foreground `ping` (`POST /users/{id}/ping`).

The SDK does **not** collect device hardware ids, IP-resolved location, contacts, or any data outside the categories above.

## Data stored on device

- The current user id and last known Expo push token are kept **in-memory only** for the SDK instance lifetime.
- The customer-controlled push-enabled flag is persisted via [`@react-native-async-storage/async-storage`](https://github.com/react-native-async-storage/async-storage) when that package is installed in your app. If it is not installed, the flag is in-memory only and defaults to `true`.

The SDK never writes to disk outside of AsyncStorage.

## Network exposure

All HTTP traffic uses the platform `fetch`. The SDK does not hit any host other than the configured `baseURL`. There is no telemetry endpoint, no bug reporter, and no external analytics relay. Push delivery transits Expo's infrastructure (per Expo's privacy policy) before reaching APNs / FCM.

## Your responsibilities as the app developer

- Disclose to end users how MotiSig AI and your backend (and Expo, if you use Expo push) use the above categories of data.
- Only pass **personal or sensitive** fields in attributes, events, or profile updates if your privacy policy and legal basis allow it.
- For iOS App Store: list MotiSig AI data uses in your **privacy labels** and complete the **Privacy Manifest** (`PrivacyInfo.xcprivacy`) for any third-party SDKs in your bundle, including the NSE you ship.
- For Google Play: declare data collection in the **Data safety** form to match your specific use of the SDK.
- For Android 13+: add the runtime `POST_NOTIFICATIONS` permission flow before you expect notifications to appear. The Expo permission helper (`requestNotificationPermissions`) handles this for you.

## Related

- [CONFIGURATION.md](CONFIGURATION.md)
- [EVENTS_TAGS_ATTRIBUTES.md](EVENTS_TAGS_ATTRIBUTES.md)
- [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md)
