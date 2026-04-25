import type { MotiSigClientEvent, MotiSigEventListener } from '../types';

/** Small sync event hub (no Node `events` dependency). */
export class MotiSigEmitter {
  private listeners = new Set<MotiSigEventListener>();

  addListener(listener: MotiSigEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: MotiSigClientEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // isolate listener failures
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
