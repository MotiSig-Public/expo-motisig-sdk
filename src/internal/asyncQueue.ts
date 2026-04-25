/** Serializes async work (FIFO), similar ordering goal to native SDK mutation queues. */
export class AsyncQueue {
  private chain: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}
