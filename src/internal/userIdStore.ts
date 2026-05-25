import { storageGetItem, storageRemoveItem, storageSetItem } from './asyncStorageAdapter';

const STORAGE_KEY = 'motisig.userId';

export async function loadPersistedUserId(): Promise<string | null> {
  const v = await storageGetItem(STORAGE_KEY);
  if (v === null || v === '') return null;
  return v;
}

export async function persistUserId(userId: string): Promise<void> {
  await storageSetItem(STORAGE_KEY, userId);
}

export async function clearPersistedUserId(): Promise<void> {
  await storageRemoveItem(STORAGE_KEY);
}
