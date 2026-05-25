import { storageGetItem, storageSetItem } from './asyncStorageAdapter';

const STORAGE_KEY = 'motisig.pushSubscription.customerEnabled';

/** Default `true` when unset. */
export async function loadCustomerPushEnabled(): Promise<boolean> {
  const v = await storageGetItem(STORAGE_KEY);
  if (v === null || v === '') return true;
  return v === 'true';
}

export async function persistCustomerPushEnabled(enabled: boolean): Promise<void> {
  await storageSetItem(STORAGE_KEY, enabled ? 'true' : 'false');
}
