import { HttpError } from "@/lib/http/errors";

const STALE_MS = 6 * 60 * 60 * 1000; // safety net: a leaked slot can never block forever

/** Tracks open stream connections: a global cap and a per-user cap. 429 + Retry-After when exceeded. */
export class StreamLimiter {
  private active = new Map<symbol, { userId: string; at: number }>();
  private perUser = new Map<string, number>();

  constructor(
    private maxTotal: () => number,
    private maxPerUser: () => number,
    private now: () => number = Date.now,
  ) {}

  /** Returns an idempotent release function. */
  acquire(userId: string): () => void {
    this.purgeStale();
    if (this.active.size >= this.maxTotal()) {
      throw new HttpError(429, "Máy chủ đang phục vụ nhiều luồng phim. Vui lòng thử lại sau ít giây.", { code: "TOO_MANY_STREAMS", retryAfter: 5 });
    }
    if ((this.perUser.get(userId) ?? 0) >= this.maxPerUser()) {
      throw new HttpError(429, "Bạn đang mở quá nhiều luồng phim cùng lúc.", { code: "TOO_MANY_USER_STREAMS", retryAfter: 5 });
    }
    const id = Symbol("stream");
    this.active.set(id, { userId, at: this.now() });
    this.perUser.set(userId, (this.perUser.get(userId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active.delete(id);
      const n = (this.perUser.get(userId) ?? 1) - 1;
      if (n <= 0) this.perUser.delete(userId);
      else this.perUser.set(userId, n);
    };
  }

  get total() {
    return this.active.size;
  }
  userCount(userId: string) {
    return this.perUser.get(userId) ?? 0;
  }

  private purgeStale() {
    const cutoff = this.now() - STALE_MS;
    for (const [id, s] of this.active) {
      if (s.at < cutoff) {
        this.active.delete(id);
        const n = (this.perUser.get(s.userId) ?? 1) - 1;
        if (n <= 0) this.perUser.delete(s.userId);
        else this.perUser.set(s.userId, n);
      }
    }
  }
}
