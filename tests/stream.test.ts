import { describe, expect, it, vi } from "vitest";
import { handleStream } from "@/lib/stream/handler";
import { HttpError, forbidden, unauthorized } from "@/lib/http/errors";
import { parseRange } from "@/lib/http/range";
import { EP_ID, FILE_SIZE, byteAt, driveFetchMock, makeHarness, readAll } from "./helpers/drive-mock";

const req = (headers: Record<string, string> = {}, method = "GET", signal?: AbortSignal) =>
  new Request(`http://localhost/api/stream/${EP_ID}`, { method, headers, signal });

describe("parseRange", () => {
  it("handles closed, open-ended and suffix ranges", () => {
    expect(parseRange("bytes=0-999999", FILE_SIZE)).toEqual({ kind: "range", start: 0, end: 999999 });
    expect(parseRange("bytes=100-", 1000)).toEqual({ kind: "range", start: 100, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ kind: "range", start: 900, end: 999 });
    expect(parseRange("bytes=500-5000", 1000)).toEqual({ kind: "range", start: 500, end: 999 });
  });
  it("flags unsatisfiable, ignores malformed/multi-range", () => {
    expect(parseRange("bytes=1000-", 1000).kind).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 1000).kind).toBe("unsatisfiable");
    expect(parseRange("bytes=5-2", 1000).kind).toBe("full");
    expect(parseRange("bytes=0-1,5-6", 1000).kind).toBe("full");
    expect(parseRange("items=0-1", 1000).kind).toBe("full");
    expect(parseRange(null, 1000).kind).toBe("full");
  });
});

describe("GET /api/stream/[episodeId]", () => {
  it("Range bytes=0-999999 → 206 with full header set", async () => {
    const h = makeHarness();
    const res = await handleStream(req({ Range: "bytes=0-999999" }), EP_ID, h.deps);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 0-999999/${FILE_SIZE}`);
    expect(res.headers.get("Content-Length")).toBe("1000000");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Type")).toBe("video/mp4"); // forced, Drive said octet-stream
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await readAll(res.body);
    expect(body.length).toBe(1_000_000);
    expect(body.first).toBe(byteAt(0));
  });

  it("Range bytes=5000000-6000000 → exact slice, Drive is asked for that range (not from byte 0)", async () => {
    const drive = driveFetchMock();
    const h = makeHarness({ driveFetch: drive.fn as unknown as typeof fetch });
    const res = await handleStream(req({ Range: "bytes=5000000-6000000" }), EP_ID, h.deps);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 5000000-6000000/${FILE_SIZE}`);
    expect(drive.requests).toHaveLength(1);
    expect(drive.requests[0].range).toBe("bytes=5000000-6000000");
    expect(drive.requests[0].auth).toBe("Bearer stale-token");
    const body = await readAll(res.body);
    expect(body.length).toBe(1_000_001);
    expect(body.first).toBe(byteAt(5_000_000));
    expect(body.last).toBe(byteAt(6_000_000));
  });

  it("no Range → 200 with Content-Length = size", async () => {
    const h = makeHarness();
    const res = await handleStream(req(), EP_ID, h.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe(String(FILE_SIZE));
    expect(res.headers.get("Content-Range")).toBeNull();
    expect((await readAll(res.body)).length).toBe(FILE_SIZE);
  });

  it("open-ended and suffix ranges are translated for Drive", async () => {
    const drive = driveFetchMock();
    const h = makeHarness({ driveFetch: drive.fn as unknown as typeof fetch });
    const open = await handleStream(req({ Range: `bytes=${FILE_SIZE - 10}-` }), EP_ID, h.deps);
    expect(open.headers.get("Content-Range")).toBe(`bytes ${FILE_SIZE - 10}-${FILE_SIZE - 1}/${FILE_SIZE}`);
    await readAll(open.body);
    const suffix = await handleStream(req({ Range: "bytes=-5" }), EP_ID, h.deps);
    expect((await readAll(suffix.body)).length).toBe(5);
    expect(drive.requests[1].range).toBe(`bytes=${FILE_SIZE - 5}-${FILE_SIZE - 1}`);
  });

  it("invalid range → 416 with Content-Range: bytes */size and no Drive call", async () => {
    const h = makeHarness();
    const res = await handleStream(req({ Range: `bytes=${FILE_SIZE + 5}-` }), EP_ID, h.deps);
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${FILE_SIZE}`);
    expect(h.openDrive).not.toHaveBeenCalled();
  });

  it("HEAD answers from DB metadata without calling Drive", async () => {
    const h = makeHarness();
    const res = await handleStream(req({}, "HEAD"), EP_ID, h.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe(String(FILE_SIZE));
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.body).toBeNull();
    expect(h.openDrive).not.toHaveBeenCalled();
    const ranged = await handleStream(req({ Range: "bytes=0-99" }, "HEAD"), EP_ID, h.deps);
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("Content-Length")).toBe("100");
  });

  it("forwards If-Range to Drive only together with a Range", async () => {
    const drive = driveFetchMock();
    const h = makeHarness({ driveFetch: drive.fn as unknown as typeof fetch });
    await handleStream(req({ Range: "bytes=0-9", "If-Range": '"abc"' }), EP_ID, h.deps);
    expect(h.openDrive.mock.calls[0][0].ifRange).toBe('"abc"');
    await handleStream(req({ "If-Range": '"abc"' }), EP_ID, h.deps);
    expect(h.openDrive.mock.calls[1][0].ifRange).toBeNull();
  });

  it("passes the request's AbortSignal to Drive", async () => {
    const h = makeHarness();
    const ac = new AbortController();
    const res = await handleStream(req({ Range: "bytes=0-9" }, "GET", ac.signal), EP_ID, h.deps);
    // Request wraps the signal, so assert propagation behaviourally: aborting the viewer aborts the Drive fetch.
    const passed = h.openDrive.mock.calls[0][0].signal as AbortSignal;
    expect(passed.aborted).toBe(false);
    ac.abort();
    expect(passed.aborted).toBe(true);
    await res.body?.cancel();
  });
});

describe("auth & access", () => {
  it("401 when not logged in, 403 when disabled", async () => {
    const h = makeHarness();
    h.setUser(unauthorized());
    expect((await handleStream(req(), EP_ID, h.deps)).status).toBe(401);
    h.setUser(forbidden());
    expect((await handleStream(req(), EP_ID, h.deps)).status).toBe(403);
    expect(h.openDrive).not.toHaveBeenCalled();
  });
  it("400 for non-UUID episode ids", async () => {
    const h = makeHarness();
    expect((await handleStream(req(), "../../etc/passwd", h.deps)).status).toBe(400);
  });
  it("404 for unknown, unpublished (user) — but admins may watch unpublished", async () => {
    const h = makeHarness();
    h.setEpisode(null);
    expect((await handleStream(req(), EP_ID, h.deps)).status).toBe(404);
    h.setEpisode({ id: EP_ID, fileId: "1AbCdEfGhIjKlMnOpQrStUv", mime: "video/mp4", size: FILE_SIZE, fileStatus: "ok", visible: false });
    expect((await handleStream(req(), EP_ID, h.deps)).status).toBe(404);
    h.setUser({ userId: "admin-1", isAdmin: true });
    expect((await handleStream(req({ Range: "bytes=0-9" }), EP_ID, h.deps)).status).toBe(206);
  });
  it("404 when file_status is missing, without calling Drive", async () => {
    const h = makeHarness();
    h.setEpisode({ fileStatus: "missing" });
    const res = await handleStream(req(), EP_ID, h.deps);
    expect(res.status).toBe(404);
    expect(h.openDrive).not.toHaveBeenCalled();
  });
});

const driveError = (status: number, reason?: string) =>
  new Response(JSON.stringify({ error: { errors: [{ reason }] } }), { status });

describe("Drive failures", () => {
  it("401 → refresh token once → success (end to end)", async () => {
    const real = driveFetchMock();
    const fn = vi.fn()
      .mockResolvedValueOnce(driveError(401))
      .mockImplementation(real.fn);
    const h = makeHarness({ driveFetch: fn as unknown as typeof fetch });
    const res = await handleStream(req({ Range: "bytes=0-9" }), EP_ID, h.deps);
    expect(res.status).toBe(206);
    expect(real.requests[0].auth).toBe("Bearer fresh-token");
    expect((await readAll(res.body)).length).toBe(10);
  });

  it("404 → file_status set to missing and 404 returned", async () => {
    const h = makeHarness({ driveFetch: vi.fn().mockResolvedValue(driveError(404)) as unknown as typeof fetch });
    const res = await handleStream(req({ Range: "bytes=0-9" }), EP_ID, h.deps);
    expect(res.status).toBe(404);
    expect(h.markMissing).toHaveBeenCalledWith(EP_ID);
    expect(h.limiter.total).toBe(0);
  });

  it("persistent 429 → retried 3x, then 429 + Retry-After, slot released", async () => {
    const fn = vi.fn().mockImplementation(async () => driveError(429));
    const h = makeHarness({ driveFetch: fn as unknown as typeof fetch });
    const res = await handleStream(req({ Range: "bytes=0-9" }), EP_ID, h.deps);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(h.limiter.total).toBe(0);
  });

  it("quota exceeded: viewers get the generic message, admins get detail", async () => {
    const fn = vi.fn().mockImplementation(async () => driveError(403, "downloadQuotaExceeded"));
    const h = makeHarness({ driveFetch: fn as unknown as typeof fetch });
    const user = await handleStream(req({ Range: "bytes=0-9" }), EP_ID, h.deps);
    expect(user.status).toBe(503);
    const ub = await user.json();
    expect(ub.error).toBe("Không thể tải video từ Google Drive. Vui lòng thử lại.");
    expect(ub.detail).toBeUndefined();
    h.setUser({ userId: "a", isAdmin: true });
    const admin = await handleStream(req({ Range: "bytes=0-9" }), EP_ID, h.deps);
    expect((await admin.json()).detail).toMatch(/downloadQuotaExceeded/);
  });

  it("503 from Drive is retried then succeeds", async () => {
    const real = driveFetchMock();
    const fn = vi.fn().mockResolvedValueOnce(driveError(503)).mockResolvedValueOnce(driveError(500)).mockImplementation(real.fn);
    const h = makeHarness({ driveFetch: fn as unknown as typeof fetch });
    const res = await handleStream(req({ Range: "bytes=0-9" }), EP_ID, h.deps);
    expect(res.status).toBe(206);
    await readAll(res.body);
  });
});

describe("concurrency limits", () => {
  it("4th concurrent stream for one user → 429 + Retry-After; slot frees when body ends", async () => {
    const h = makeHarness({ maxPerUser: 3 });
    const open: Response[] = [];
    for (let i = 0; i < 3; i++) open.push(await handleStream(req({ Range: `bytes=${i * 100}-` }), EP_ID, h.deps));
    expect(h.limiter.userCount("user-1")).toBe(3);
    const blocked = await handleStream(req({ Range: "bytes=0-9" }), EP_ID, h.deps);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();

    await open[0].body?.cancel(); // viewer seeked / closed
    expect(h.limiter.userCount("user-1")).toBe(2);
    const again = await handleStream(req({ Range: "bytes=0-9" }), EP_ID, h.deps);
    expect(again.status).toBe(206);
    await Promise.all([again, open[1], open[2]].map((r) => r.body?.cancel()));
    expect(h.limiter.total).toBe(0);
  });

  it("global cap applies across users", async () => {
    const h = makeHarness({ maxTotal: 2, maxPerUser: 5 });
    const a = await handleStream(req({ Range: "bytes=0-99" }), EP_ID, h.deps);
    h.setUser({ userId: "user-2", isAdmin: false });
    const b = await handleStream(req({ Range: "bytes=0-99" }), EP_ID, h.deps);
    h.setUser({ userId: "user-3", isAdmin: false });
    expect((await handleStream(req({ Range: "bytes=0-99" }), EP_ID, h.deps)).status).toBe(429);
    await a.body?.cancel();
    await b.body?.cancel();
  });

  it("releases the slot when the body finishes normally", async () => {
    const h = makeHarness();
    const res = await handleStream(req({ Range: "bytes=0-99" }), EP_ID, h.deps);
    expect(h.limiter.total).toBe(1);
    await readAll(res.body);
    expect(h.limiter.total).toBe(0);
  });
});

describe("memory behaviour", () => {
  it("does not read ahead of the consumer (backpressure): one chunk pulled per read", async () => {
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls++;
        c.enqueue(new Uint8Array(65536));
      },
    }, { highWaterMark: 0 });
    const { pipeWithRelease } = await import("@/lib/stream/pipe");
    const out = pipeWithRelease(source, () => undefined);
    const reader = out.getReader();
    await reader.read();
    await new Promise((r) => setTimeout(r, 20));
    expect(pulls).toBeLessThanOrEqual(2); // a 100 GB file would otherwise pull unboundedly
    await reader.cancel();
  });
});

it("HttpError is what the auth layer throws", () => {
  expect(unauthorized()).toBeInstanceOf(HttpError);
});
