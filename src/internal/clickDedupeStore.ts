import { storageGetItem, storageSetItem } from './asyncStorageAdapter';

const STORAGE_KEY = 'motisig.clickDedupe.v1';
const MAX_IDS = 100;

export class ClickDedupeStore {
  private ids: string[] = [];
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    const raw = await storageGetItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          this.ids = parsed.filter((id) => typeof id === 'string').slice(-MAX_IDS);
        }
      } catch {
        this.ids = [];
      }
    }
    this.loaded = true;
  }

  async has(messageId: string): Promise<boolean> {
    await this.load();
    return this.ids.includes(messageId);
  }

  async add(messageId: string): Promise<void> {
    await this.load();
    if (this.ids.includes(messageId)) return;
    this.ids.push(messageId);
    if (this.ids.length > MAX_IDS) {
      this.ids = this.ids.slice(this.ids.length - MAX_IDS);
    }
    await storageSetItem(STORAGE_KEY, JSON.stringify(this.ids));
  }

  async clear(): Promise<void> {
    this.ids = [];
    this.loaded = true;
    await storageSetItem(STORAGE_KEY, JSON.stringify([]));
  }
}
