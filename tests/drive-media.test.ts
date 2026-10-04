import { describe, expect, it, vi } from "vitest";
import { fetchDriveMedia, type MediaDeps } from "@/lib/google-drive/stream";
import { classifyDriveHttpError } from "@/lib/google-drive/errors";

const FILE = "1AbCdEfGhIjKlMnOpQrStUv";

function deps(responses: (Response | Error)[]): MediaDeps & { calls: RequestInit[]; tokens: boolean[] } {
  const calls: RequestInit[] = [];
  const tokens: boolean[] = [];
  const queue = [...responses];
  return {
    calls,
    tokens,
    fetch: vi.fn(async (_u: unknown, init?: RequestInit) => {
      calls.push(init ?? {});
      const next = queue.shift()!;
      if (next instanceof Error) throw next;
      return next;
    }) as unknown as typeof fetch,
    getToken: async (force) => {
      tokens.push(!!force);
      return force ? "fresh" : "stale";
    },
    sleep: async () => undefined,
    random: () => 0.5,
  };
}
const err = (status: number, reason?: string) =>
  new Response(JSON.stringify({ error: { errors: [{ reason }] } }), { status });

describe("fetchDriveMedia", () => {
  it("forwards Range and If-Range with the Bearer token", async () => {
    const d = deps([new Response("x", { status: 206 })]);
    const res = await fetchDriveMedia({ fileId: FILE, range: "bytes=5000000-6000000", ifRange: '"etag"' }, d);
    expect(res.status).toBe(206);
    const h = d.calls[0].headers as Record<string, string>;
    expect(h.Range).toBe("bytes=5000000-6000000");
    expect(h["If-Range"]).toBe('"etag"');
    expect(h.Authorization).toBe("Bearer stale");
  });
  it("401 → refreshes once and retries", async () => {
    const d = deps([err(401), new Response("ok", { status: 200 })]);
    const res = await fetchDriveMedia({ fileId: FILE }, d);
    expect(res.status).toBe(200);
    expect(d.tokens).toEqual([false, true]);
    expect((d.calls[1].headers as Record<string, string>).Authorization).toBe("Bearer fresh");
  });
  it("401 twice → disconnected", async () => {
    const d = deps([err(401), err(401)]);
    await expect(fetchDriveMedia({ fileId: FILE }, d)).rejects.toMatchObject({ kind: "disconnected" });
  });
  it("404 → not_found, no retry", async () => {
    const d = deps([err(404)]);
    await expect(fetchDriveMedia({ fileId: FILE }, d)).rejects.toMatchObject({ kind: "not_found" });
    expect(d.calls).toHaveLength(1);
  });
  it("403 downloadQuotaExceeded → quota, no retry", async () => {
    const d = deps([err(403, "downloadQuotaExceeded")]);
    await expect(fetchDriveMedia({ fileId: FILE }, d)).rejects.toMatchObject({ kind: "quota" });
    expect(d.calls).toHaveLength(1);
  });
  it("429 retries up to 3 times then fails", async () => {
    const d = deps([err(429), err(429), err(429), err(429)]);
    await expect(fetchDriveMedia({ fileId: FILE }, d)).rejects.toMatchObject({ kind: "rate_limit" });
    expect(d.calls).toHaveLength(4); // 1 try + 3 retries
  });
  it("503 then success", async () => {
    const d = deps([err(503), new Response("ok", { status: 200 })]);
    expect((await fetchDriveMedia({ fileId: FILE }, d)).status).toBe(200);
  });
  it("retries network errors but rethrows aborts", async () => {
    const ok = deps([new Error("ECONNRESET"), new Response("ok", { status: 200 })]);
    expect((await fetchDriveMedia({ fileId: FILE }, ok)).status).toBe(200);
    const ac = new AbortController();
    ac.abort();
    const aborted = deps([new DOMException("aborted", "AbortError")]);
    await expect(fetchDriveMedia({ fileId: FILE, signal: ac.signal }, aborted)).rejects.toThrow();
    expect(aborted.calls).toHaveLength(1);
  });
  it("rejects malformed file ids before any network call", async () => {
    const d = deps([]);
    await expect(fetchDriveMedia({ fileId: "../etc/passwd" }, d)).rejects.toMatchObject({ kind: "not_found" });
    expect(d.calls).toHaveLength(0);
  });
});

describe("classifyDriveHttpError", () => {
  it("distinguishes 403 reasons", () => {
    expect(classifyDriveHttpError(403, { error: { errors: [{ reason: "userRateLimitExceeded" }] } }).kind).toBe("rate_limit");
    expect(classifyDriveHttpError(403, { error: { errors: [{ reason: "forbidden" }] } }).kind).toBe("forbidden");
    expect(classifyDriveHttpError(500, null).kind).toBe("unavailable");
  });
});
