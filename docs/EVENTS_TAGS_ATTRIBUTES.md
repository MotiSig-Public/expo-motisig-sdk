# Events, tags, attributes, and ping

These APIs require an initialized SDK and a **current user** from `setUser`. Calling them without a user **throws** synchronously inside the queued task.

## Tags

```ts
await motisig.addTags(['premium', 'beta-tester']);
await motisig.removeTags(['beta-tester']);
```

- `addTags(tags: string[])` → `POST /users/{id}/tags`.
- `removeTags(tags: string[])` → `DELETE /users/{id}/tags`.

## Attributes

```ts
await motisig.addOrUpdateAttributes({
  plan: 'pro',
  signupChannel: 'web',
  age: 32,
});

await motisig.removeAttributes(['signupChannel']);
```

- `addOrUpdateAttributes(attrs: Record<string, unknown>)` → `POST /users/{id}/attributes`. Values must be JSON-serializable.
- `removeAttributes(keys: string[])` → `DELETE /users/{id}/attributes`.

## `ping()`

```ts
await motisig.ping();
```

Sends `POST /users/{id}/ping`. The SDK already calls `ping` automatically:

- Once whenever `AppState` changes (active or backgrounded).
- Every `pingIntervalSeconds` (default 60) while the app is active.

Explicit calls are useful if you have a custom presence model or need a heartbeat tied to a specific UI event.

## `triggerEvent(eventName, data?)`

```ts
const message = await motisig.triggerEvent('screen_view', { screen: 'home' });
console.log(message);
```

- `eventName: string` — server-defined event name.
- `data?: Record<string, unknown>` — optional JSON-serializable payload; omitted when `undefined`.

Returns `Promise<string>` resolving to the server `message` field. Rejects on transport errors, missing user, or non-2xx responses (`MotiSigApiError`).

## Click tracking

```ts
await motisig.trackClick('message-uuid', /* isForeground */ true);
```

`trackClick(messageId, isForeground?)` → `POST /track/click` with `userId`, `messageId`, and optional `isForeground`. Most apps don't need to call this directly because the SDK runs it automatically when:

- a notification payload contains `messageId`, **and**
- a user is set, **and**
- the app is opened by a tap (`notification_response`), or a foreground delivery is received.

## Errors

- All methods throw on missing user with `Error('No user is set; call setUser first')`.
- Network and 4xx/5xx errors throw `MotiSigApiError` (statusCode + body) so you can surface a retry UI.

## Related

- [USER_PROFILE.md](USER_PROFILE.md)
- [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md)
