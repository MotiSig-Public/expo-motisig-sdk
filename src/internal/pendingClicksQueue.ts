import { AsyncQueue } from './asyncQueue';
import { storageGetItem, storageSetItem } from './asyncStorageAdapter';

const STORAGE_KEY = 'motisig.pendingClicks.v1';
const MAX_ENTRIES = 200;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingClick {
  id: string;
  messageId: string;
  isForeground?: boolean;
  userId?: string;
  enqueuedAt: number;
  attempts: number;
  nextAttemptAt: number;
}

export interface PendingClickEnqueue {
  messageId: string;
  isForeground?: boolean;
  userId?: string;
}

function generateId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${t}-${r}`;
}

function purgeStale(entries: PendingClick[], now: number): PendingClick[] {
  return entries.filter((e) => now - e.enqueuedAt <= TTL_MS);
}

function capEntries(entries: PendingClick[]): PendingClick[] {
  if (entries.length <= MAX_ENTRIES) return entries;
  return entries.slice(entries.length - MAX_ENTRIES);
}

export class PendingClicksQueue {
  private readonly writeLock = new AsyncQueue();
  private entries: PendingClick[] = [];
  private loaded = false;

  async load(): Promise<void> {
    await this.writeLock.run(async () => {
      if (this.loaded) return;
      const raw = await storageGetItem(STORAGE_KEY);
      const now = Date.now();
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as PendingClick[];
          if (Array.isArray(parsed)) {
            this.entries = capEntries(purgeStale(parsed, now));
          }
        } catch {
          this.entries = [];
        }
      }
      this.loaded = true;
    });
  }

  async enqueue(input: PendingClickEnqueue): Promise<PendingClick> {
    return this.writeLock.run(async () => {
      await this.ensureLoaded();
      const now = Date.now();
      const entry: PendingClick = {
        id: generateId(),
        messageId: input.messageId,
        isForeground: input.isForeground,
        userId: input.userId,
        enqueuedAt: now,
        attempts: 0,
        nextAttemptAt: now,
      };
      this.entries.push(entry);
      this.entries = capEntries(purgeStale(this.entries, now));
      await this.persist();
      return entry;
    });
  }

  async peekDue(now: number): Promise<PendingClick[]> {
    return this.writeLock.run(async () => {
      await this.ensureLoaded();
      return this.entries.filter((e) => e.nextAttemptAt <= now);
    });
  }

  async markSent(id: string): Promise<void> {
    await this.writeLock.run(async () => {
      await this.ensureLoaded();
      this.entries = this.entries.filter((e) => e.id !== id);
      await this.persist();
    });
  }

  async recordFailure(id: string, nextAttemptAt: number, attempts: number): Promise<void> {
    await this.writeLock.run(async () => {
      await this.ensureLoaded();
      const idx = this.entries.findIndex((e) => e.id === id);
      if (idx < 0) return;
      this.entries[idx] = {
        ...this.entries[idx],
        attempts,
        nextAttemptAt,
      };
      await this.persist();
    });
  }

  async updateUserIdForPending(userId: string): Promise<void> {
    await this.writeLock.run(async () => {
      await this.ensureLoaded();
      let changed = false;
      this.entries = this.entries.map((e) => {
        if (e.userId) return e;
        changed = true;
        return { ...e, userId };
      });
      if (changed) await this.persist();
    });
  }

  async clearAll(): Promise<void> {
    await this.writeLock.run(async () => {
      this.entries = [];
      this.loaded = true;
      await this.persist();
    });
  }

  async getSoonestRetryAt(): Promise<number | null> {
    return this.writeLock.run(async () => {
      await this.ensureLoaded();
      if (this.entries.length === 0) return null;
      return Math.min(...this.entries.map((e) => e.nextAttemptAt));
    });
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
  }

  private async persist(): Promise<void> {
    await storageSetItem(STORAGE_KEY, JSON.stringify(this.entries));
  }
}
