/** Soft wrapper around @react-native-async-storage/async-storage with in-memory fallback. */

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

function tryGetAsyncStorage(): AsyncStorageLike | null {
  try {
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
}

export function hasPersistentStorage(): boolean {
  return tryGetAsyncStorage() != null;
}

export async function storageGetItem(key: string): Promise<string | null> {
  const s = tryGetAsyncStorage();
  if (s) {
    return s.getItem(key);
  }
  return memoryStore.get(key) ?? null;
}

export async function storageSetItem(key: string, value: string): Promise<void> {
  const s = tryGetAsyncStorage();
  if (s) {
    await s.setItem(key, value);
  } else {
    memoryStore.set(key, value);
  }
}

export async function storageRemoveItem(key: string): Promise<void> {
  const s = tryGetAsyncStorage();
  if (s) {
    await s.removeItem(key);
  } else {
    memoryStore.delete(key);
  }
}
