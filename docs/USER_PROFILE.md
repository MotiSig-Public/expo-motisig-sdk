# User and profile

All APIs below are on a `MotiSig` instance after `await motisig.initialize(...)`.

## `setUser(id, extras?)`

Registers the user with the MotiSig AI client API (`POST /users`) with `platform`, `timezone` (`Intl.DateTimeFormat().resolvedOptions().timeZone`), and `locale`. Any fields you pass in `extras` override those defaults.

- If the server returns **409 Conflict**, the SDK treats the user as already registered and continues.
- On success (including the 409 path), the user id is stored in memory.
- After the user id is set, the SDK upserts an **Expo push subscription** (token + `permission` + customer-`enabled` flag) when an Expo push token is available. See [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md).
- Switching to a different user id resets `lastSyncedPermission` so the next foreground resume re-evaluates and patches if needed.

`setUser` runs on the SDK's `AsyncQueue` relative to other mutations.

```ts
await motisig.setUser('user-123');

await motisig.setUser('user-123', {
  timezone: 'America/Los_Angeles',
  locale: 'en-US',
});
```

## `updateUser(payload)`

Sends `PATCH /users/{id}` with the fields allowed by the client API:

```ts
await motisig.updateUser({
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  // timezone and locale default to the device values if omitted
});
```

If no user is set, the call **throws** (`No user is set; call setUser first`). All user-scoped methods throw on missing user — wrap in `try/catch` if you want to ignore that case.

## `logout()`

- If both `userId` and a known Expo push token exist, the SDK enqueues `DELETE …/push-subscriptions` for that pair (best-effort; errors are swallowed).
- Clears `userId` and `lastSyncedPermission`.
- Does **not** detach notification listeners or clear the customer push preference. Use `reset()` for a full teardown.

```ts
await motisig.logout();
```

## `reset()`

Tears down everything in-process:

- Removes notification listeners (`expo-notifications`).
- Stops the foreground ping interval and `AppState` subscription.
- Clears the event emitter.
- Drops `userId`, `lastToken`, `lastSyncedPermission`, and the foreground id ring buffer.
- Marks the instance uninitialized; you can call `initialize` again afterward.

`reset()` is synchronous and does **not** call the server. Combine with `logout()` if you also want to remove the server-side push subscription.

## `getUser()`

```ts
const user = await motisig.getUser();
```

Calls `GET /users/{id}` for the current user; returns `null` on 404. Throws if no user is set.

## Mutation queue semantics

Every user-scoped HTTP call is wrapped in `mutationQueue.run(async () => { ... })`. The queue is a single-threaded promise chain that:

1. Captures `userId` (and the resolved Expo push token, where applicable) at the moment the closure runs.
2. Awaits the previous mutation before starting the next.
3. Lets exceptions propagate to the caller's `await`.

This guarantees that the **observable order** of writes matches the order of calls, even when individual HTTP requests would otherwise complete out of order.

## Related

- [EVENTS_TAGS_ATTRIBUTES.md](EVENTS_TAGS_ATTRIBUTES.md)
- [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md)
- `MotiSigApiError` / `MotiSigError` in [`src/errors`](../src/errors)
