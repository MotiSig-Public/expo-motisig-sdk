import type { MotiSigApi } from '../api/motiSigApi';
import { MotiSigApiError } from '../errors';
import type { MotiSigClickRetryOptions } from '../types';
import { ClickDedupeStore } from './clickDedupeStore';
import { logger } from './logger';
import { PendingClicksQueue, type PendingClickEnqueue } from './pendingClicksQueue';

const DEFAULT_MAX_ATTEMPTS = 50;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 60_000;

export interface ClickDispatcherDeps {
  apiProvider: () => MotiSigApi | null;
  userIdProvider: () => string | null;
  clickRetry?: MotiSigClickRetryOptions;
}

function isRetryableStatus(status: number): boolean {
  if (status === 0 || status === 408 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

function isNonRetryableClientError(status: number): boolean {
  return status >= 400 && status < 500 && !isRetryableStatus(status);
}

function backoffMs(attempts: number, baseMs: number, maxMs: number): number {
  const raw = baseMs * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(maxMs, Math.floor(raw));
}

export class ClickDispatcher {
  private readonly queue = new PendingClicksQueue();
  private readonly dedupe = new ClickDedupeStore();
  private readonly apiProvider: () => MotiSigApi | null;
  private readonly userIdProvider: () => string | null;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  private disposed = false;
  private drainRunning = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: ClickDispatcherDeps) {
    this.apiProvider = deps.apiProvider;
    this.userIdProvider = deps.userIdProvider;
    const retry = deps.clickRetry ?? {};
    this.maxAttempts = retry.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseDelayMs = retry.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = retry.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  }

  async start(): Promise<void> {
    await Promise.all([this.queue.load(), this.dedupe.load()]);
    this.kick();
  }

  kick(): void {
    if (this.disposed) return;
    void this.runDrain();
    void this.scheduleRetryTimer();
  }

  async enqueueClick(input: PendingClickEnqueue): Promise<void> {
    if (this.disposed) return;
    const messageId = input.messageId?.trim();
    if (!messageId) return;
    if (await this.dedupe.has(messageId)) return;
    await this.queue.enqueue({ ...input, messageId });
    this.kick();
  }

  async onUserSet(userId: string): Promise<void> {
    if (this.disposed) return;
    await this.queue.updateUserIdForPending(userId);
    this.kick();
  }

  async clearAll(): Promise<void> {
    await this.queue.clearAll();
    await this.dedupe.clear();
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async scheduleRetryTimer(): Promise<void> {
    if (this.disposed) return;
    const at = await this.queue.getSoonestRetryAt();
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (at == null) return;
    const delay = Math.max(0, at - Date.now());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.kick();
    }, delay);
  }

  private async runDrain(): Promise<void> {
    if (this.disposed || this.drainRunning) return;
    this.drainRunning = true;
    try {
      for (;;) {
        if (this.disposed) break;
        const progressed = await this.drainDueBatch();
        if (!progressed) break;
      }
    } finally {
      this.drainRunning = false;
      void this.scheduleRetryTimer();
    }
  }

  /** @returns true if any entry was processed or dropped */
  private async drainDueBatch(): Promise<boolean> {
    const api = this.apiProvider();
    if (!api) return false;

    const now = Date.now();
    const due = await this.queue.peekDue(now);
    if (due.length === 0) return false;

    let acted = false;
    for (const entry of due) {
      if (this.disposed) break;
      if (await this.dedupe.has(entry.messageId)) {
        await this.queue.markSent(entry.id);
        acted = true;
        continue;
      }

      const userId = entry.userId ?? this.userIdProvider();
      if (!userId) continue;

      try {
        await api.trackClick({
          userId,
          messageId: entry.messageId,
          isForeground: entry.isForeground,
        });
        await this.queue.markSent(entry.id);
        await this.dedupe.add(entry.messageId);
        acted = true;
      } catch (err) {
        const status = err instanceof MotiSigApiError ? err.statusCode : 0;
        if (isNonRetryableClientError(status)) {
          logger.warn('click dropped (non-retryable)', {
            messageId: entry.messageId,
            status,
          });
          await this.queue.markSent(entry.id);
          acted = true;
          continue;
        }
        if (!isRetryableStatus(status)) {
          logger.warn('click dropped (unexpected status)', {
            messageId: entry.messageId,
            status,
          });
          await this.queue.markSent(entry.id);
          acted = true;
          continue;
        }

        const attempts = entry.attempts + 1;
        if (attempts >= this.maxAttempts) {
          logger.warn('click dropped (max attempts)', {
            messageId: entry.messageId,
            attempts,
            status,
          });
          await this.queue.markSent(entry.id);
          acted = true;
          continue;
        }

        const nextAttemptAt = now + backoffMs(attempts, this.baseDelayMs, this.maxDelayMs);
        await this.queue.recordFailure(entry.id, nextAttemptAt, attempts);
        acted = true;
      }
    }

    return acted;
  }
}
