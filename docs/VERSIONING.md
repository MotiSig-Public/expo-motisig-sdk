# Versioning and the push payload contract

## Image payload contract

The reference NSE returns the first non-empty match from:

1. `_motisig.imageUrl` / `_motisig.image_url` / `_motisig.image` (MotiSig AI canonical)
2. `_richContent.image` (Expo push relay — what you get when sending via the Expo push API)
3. `fcm_options.image` (FCM relay)
4. Top-level `image` / `imageUrl` / `image_url` (host-app convenience)

A single server payload that uses `_motisig.imageUrl` lights up the banner image wherever the right delivery setup is in place. See [RICH_IMAGES.md](RICH_IMAGES.md).

## Versioning

`@motisig/expo-motisig-sdk` follows **semantic versioning**. Changes considered breaking:

- Removing or renaming an exported symbol from `@motisig/expo-motisig-sdk`.
- Changing the shape of `MotiSigInitializeOptions` (adding required fields, renaming fields, narrowing types).
- Changing the discriminated union `MotiSigClientEvent`.
- Renaming or removing a `MotiSigApiError` / `MotiSigError` shape.
- Bumping a peer dependency to a new major (`expo`, `expo-notifications`, `react-native`).
- Changing the canonical push payload keys (`_motisig.imageUrl`, `messageId`, etc.) on the wire.

Additive changes (new methods, new optional options, new event fields) are minor or patch.

## Related

- [GETTING_STARTED.md](GETTING_STARTED.md)
- [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md)
- [RICH_IMAGES.md](RICH_IMAGES.md)
