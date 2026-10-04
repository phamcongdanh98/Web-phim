import { describe, expect, it, beforeEach } from "vitest";
import { computeProgress } from "@/lib/utils/progress";
import { safeNextPath } from "@/lib/utils/safe-redirect";
import { slugify, formatDuration, formatBytes } from "@/lib/utils/format";
import { rateLimit, resetRateLimits } from "@/lib/http/rate-limit";
import { HttpError } from "@/lib/http/errors";

describe("computeProgress", () => {
  it("computes percentage and not completed under 92%", () => {
    const r = computeProgress({ positionSeconds: 500, durationSeconds: 1000 });
    expect(r).toMatchObject({ position_seconds: 500, percentage: 50, completed: false });
  });
  it("marks completed at >= 92%", () => {
    expect(computeProgress({ positionSeconds: 920, durationSeconds: 1000 }).completed).toBe(true);
    expect(computeProgress({ positionSeconds: 919, durationSeconds: 1000 }).completed).toBe(false);
  });
  it("clamps position to duration and handles zero duration", () => {
    expect(computeProgress({ positionSeconds: 5000, durationSeconds: 1000 }).position_seconds).toBe(1000);
    expect(computeProgress({ positionSeconds: 10, durationSeconds: 0 }).percentage).toBe(0);
  });
});

describe("safeNextPath", () => {
  it("accepts relative paths only", () => {
    expect(safeNextPath("/movie/abc")).toBe("/movie/abc");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

describe("format helpers", () => {
  it("slugify strips Vietnamese diacritics", () => {
    expect(slugify("Đại Chiến Người Sắt!")).toBe("dai-chien-nguoi-sat");
  });
  it("formatDuration", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
  it("formatBytes", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(null)).toBe("—");
  });
});

describe("rateLimit", () => {
  beforeEach(resetRateLimits);
  it("allows up to the limit then throws 429 with Retry-After", () => {
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 1000, 0);
    try {
      rateLimit("k", 3, 1000, 100);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(429);
      expect((e as HttpError).opts.retryAfter).toBe(1);
    }
  });
  it("resets after the window", () => {
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 1000, 0);
    expect(() => rateLimit("k", 3, 1000, 1001)).not.toThrow();
  });
});
