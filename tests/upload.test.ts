import { describe, expect, it, vi } from "vitest";
import { backoffDelay, CHUNK_UNIT, DEFAULT_CHUNK, fingerprint, normaliseChunkSize, offsetFromRangeHeader, planChunk, statusProbeRange } from "@/lib/upload/protocol";
import { ResumableUploader, UploadAbortedError, UploadFatalError } from "@/lib/upload/resumable";
import { fakeGoogle } from "./helpers/fake-google-upload";

const blob = (n: number) => ({ size: n, slice: (a: number, b: number) => ({ size: b - a }) }) as unknown as Blob;
const noSleep = async () => undefined;

describe("protocol helpers", () => {
  it("chunk size is a multiple of 256 KiB, default 16 MiB", () => {
    expect(DEFAULT_CHUNK % CHUNK_UNIT).toBe(0);
    expect(normaliseChunkSize(1_000_000) % CHUNK_UNIT).toBe(0);
    expect(normaliseChunkSize(10)).toBe(CHUNK_UNIT);
  });
  it("plans chunks incl. a smaller last chunk", () => {
    expect(planChunk(0, 40_000_000, DEFAULT_CHUNK)).toMatchObject({ length: DEFAULT_CHUNK, contentRange: `bytes 0-${DEFAULT_CHUNK - 1}/40000000` });
    const last = planChunk(2 * DEFAULT_CHUNK, 40_000_000, DEFAULT_CHUNK);
    expect(last.length).toBe(40_000_000 - 2 * DEFAULT_CHUNK);
    expect(last.contentRange).toBe(`bytes ${2 * DEFAULT_CHUNK}-39999999/40000000`);
    expect(() => planChunk(40_000_000, 40_000_000, DEFAULT_CHUNK)).toThrow();
  });
  it("status probe + Range header parsing", () => {
    expect(statusProbeRange(123)).toBe("bytes */123");
    expect(offsetFromRangeHeader("bytes=0-262143")).toBe(262144);
    expect(offsetFromRangeHeader(undefined)).toBe(0);
    expect(offsetFromRangeHeader("garbage")).toBe(0);
  });
  it("backoff grows, is capped and jittered", () => {
    expect(backoffDelay(0, () => 1)).toBe(1000);
    expect(backoffDelay(3, () => 1)).toBe(8000);
    expect(backoffDelay(20, () => 1)).toBe(30000);
    expect(backoffDelay(2, () => 0)).toBe(2000);
  });
  it("fingerprint is stable", () => {
    expect(fingerprint({ name: "a.mp4", size: 5, lastModified: 9 })).toBe("a.mp4|5|9");
  });
});

describe("ResumableUploader", () => {
  const total = 3 * CHUNK_UNIT * 4 + 1000; // 3.x chunks of 1 MiB, uneven tail
  const chunk = CHUNK_UNIT * 4;

  it("uploads sequential chunks, last one smaller, returns file id", async () => {
    const g = fakeGoogle({ total });
    const progress: number[] = [];
    const up = new ResumableUploader(blob(total), "https://upload/x", { chunkSize: chunk, transport: g.transport, onProgress: (u) => progress.push(u) });
    const file = await up.upload();
    expect(file.id).toBe("FILE123456789");
    expect(g.log.map((l) => l.range)).toEqual([
      `bytes 0-${chunk - 1}/${total}`,
      `bytes ${chunk}-${2 * chunk - 1}/${total}`,
      `bytes ${2 * chunk}-${3 * chunk - 1}/${total}`,
      `bytes ${3 * chunk}-${total - 1}/${total}`,
    ]);
    expect(progress.at(-1)).toBe(total);
  });

  it("5xx mid-upload: probes offset and resumes WITHOUT restarting from 0", async () => {
    const g = fakeGoogle({ total, failRequests: { 3: 503 } });
    const onRetry = vi.fn();
    const up = new ResumableUploader(blob(total), "u", { chunkSize: chunk, transport: g.transport, sleep: noSleep, onRetry });
    await up.upload();
    expect(onRetry).toHaveBeenCalledTimes(1);
    const sent = g.log.map((l) => l.range);
    expect(sent.filter((r) => r.startsWith("bytes 0-"))).toHaveLength(1); // chunk 0 sent exactly once
    expect(sent).toContain(`bytes */${total}`); // status probe issued
    expect(g.persisted).toBe(total);
  });

  it("network error is retried the same way", async () => {
    const g = fakeGoogle({ total, failRequests: { 2: "network", 3: "network" } });
    const up = new ResumableUploader(blob(total), "u", { chunkSize: chunk, transport: g.transport, sleep: noSleep });
    await expect(up.upload()).resolves.toMatchObject({ id: "FILE123456789" });
  });

  it("honours Google's confirmed offset when it accepts only part of a chunk", async () => {
    const g = fakeGoogle({ total, partialAcceptOnRequest: { 1: CHUNK_UNIT } }); // accepted 256 KiB of 1 MiB
    const up = new ResumableUploader(blob(total), "u", { chunkSize: chunk, transport: g.transport, sleep: noSleep });
    await up.upload();
    expect(g.log[1].range.startsWith(`bytes ${CHUNK_UNIT}-`)).toBe(true); // next chunk starts at confirmed offset
  });

  it("resumes an interrupted upload via status probe (offset from Range header)", async () => {
    // Simulates a page reload: chunk 0 was confirmed earlier, a new uploader probes and continues.
    const second = fakeGoogle({ total });
    await second.transport("u", { "Content-Range": `bytes 0-${chunk - 1}/${total}` }, blob(chunk), {});
    const resume = new ResumableUploader(blob(total), "u", { chunkSize: chunk, transport: second.transport });
    const st = await resume.queryStatus();
    expect(st).toEqual({ done: false, offset: chunk });
    await resume.upload(chunk);
    expect(second.persisted).toBe(total);
  });

  it("gives up after maxRetries with a resumable message", async () => {
    const fail: Record<number, 503> = {};
    for (let i = 1; i < 50; i++) fail[i] = 503;
    const g = fakeGoogle({ total, failRequests: fail });
    const up = new ResumableUploader(blob(total), "u", { chunkSize: chunk, transport: g.transport, sleep: noSleep, maxRetries: 2 });
    await expect(up.upload()).rejects.toBeInstanceOf(UploadFatalError);
  });

  it("4xx is fatal and not retried; 404 flags an expired session", async () => {
    const g = fakeGoogle({ total, failRequests: { 1: 404 } });
    const up = new ResumableUploader(blob(total), "u", { chunkSize: chunk, transport: g.transport, sleep: noSleep });
    await expect(up.upload()).rejects.toMatchObject({ sessionExpired: true });
    expect(g.requests).toBe(1);
    const g2 = fakeGoogle({ total, failRequests: { 1: 403 } });
    await expect(new ResumableUploader(blob(total), "u", { chunkSize: chunk, transport: g2.transport }).upload()).rejects.toMatchObject({ sessionExpired: false });
  });

  it("abort stops the upload", async () => {
    const g = fakeGoogle({ total });
    const ac = new AbortController();
    const up = new ResumableUploader(blob(total), "u", {
      chunkSize: chunk,
      transport: g.transport,
      signal: ac.signal,
      onProgress: (u) => u >= chunk && ac.abort(),
    });
    await expect(up.upload()).rejects.toBeInstanceOf(UploadAbortedError);
    expect(g.persisted).toBeLessThan(total);
  });

  it("only slices one chunk at a time (memory ≈ one chunk)", async () => {
    const g = fakeGoogle({ total });
    const slice = vi.fn((a: number, b: number) => ({ size: b - a }) as Blob);
    const file = { size: total, slice } as unknown as Blob;
    await new ResumableUploader(file, "u", { chunkSize: chunk, transport: g.transport }).upload();
    for (const [a, b] of slice.mock.calls) expect(b - a).toBeLessThanOrEqual(chunk);
  });

  it("supports very large sizes (20 GB) in the plan without allocating", () => {
    const twenty = 20 * 1024 ** 3;
    const plan = planChunk(twenty - 1000, twenty, DEFAULT_CHUNK);
    expect(plan.length).toBe(1000);
    expect(Math.ceil(twenty / DEFAULT_CHUNK)).toBe(1280);
  });
});
