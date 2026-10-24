export class BackgroundWork {
  private accepting = true;
  private readonly inFlight = new Set<Promise<unknown>>();

  get isAccepting(): boolean {
    return this.accepting;
  }

  get activeCount(): number {
    return this.inFlight.size;
  }

  run<T>(work: () => Promise<T>): Promise<T> | null {
    if (!this.accepting) return null;

    const task = Promise.resolve().then(work);
    this.inFlight.add(task);
    void task.then(
      () => this.inFlight.delete(task),
      () => this.inFlight.delete(task),
    );
    return task;
  }

  stopAccepting(): void {
    this.accepting = false;
  }

  async drain(timeoutMs: number): Promise<boolean> {
    this.stopAccepting();

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const drained = (async () => {
      while (this.inFlight.size > 0) {
        await Promise.allSettled([...this.inFlight]);
      }
      return true;
    })();
    const deadline = new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => resolve(false), timeoutMs);
    });

    try {
      return await Promise.race([drained, deadline]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
