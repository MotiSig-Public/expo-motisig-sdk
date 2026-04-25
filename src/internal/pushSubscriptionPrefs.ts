const STORAGE_KEY = 'motisig.pushSubscription.customerEnabled';

let memoryFallback: boolean | undefined;

function tryGetAsyncStorage():
  | null
  | { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> } {
  try {
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
}

/** Default `true` when unset. */
export async function loadCustomerPushEnabled(): Promise<boolean> {
  const s = tryGetAsyncStorage();
  if (s) {
    const v = await s.getItem(STORAGE_KEY);
    if (v === null || v === '') return true;
    return v === 'true';
  }
  return memoryFallback !== false;
}

export async function persistCustomerPushEnabled(enabled: boolean): Promise<void> {
  const s = tryGetAsyncStorage();
  if (s) {
    await s.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } else {
    memoryFallback = enabled;
  }
}
