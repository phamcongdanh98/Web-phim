import { vi } from "vitest";
import { StreamLimiter } from "@/lib/stream/limiter";
import { fetchDriveMedia, type MediaDeps } from "@/lib/google-drive/stream";
import { HttpError } from "@/lib/http/errors";
import type { StreamDeps, StreamEpisode, StreamUser } from "@/lib/stream/handler";

export const EP_ID = "123e4567-e89b-42d3-a456-426614174000";
export const FILE_ID = "1AbCdEfGhIjKlMnOpQrStUv";
export const FILE_SIZE = 8_000_000;

/** Deterministic byte at an absolute offset, so tests can prove the *right* range was served. */
export const byteAt = (offset: number) => offset % 251;

/** Streams `[start, end]` of the fake file lazily in 64 KiB chunks (never allocates the whole file). */
export function fakeFileStream(start: number, end: number): ReadableStream<Uint8Array> {
  let pos = start;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pos > end) return controller.close();
      const n = Math.min(65536, end - pos + 1);
      const chunk = new Uint8Array(n);
      for (let i = 0; i < n; i++) chunk[i] = byteAt(pos + i);
      pos += n;
      controller.enqueue(chunk);
    },
  });
}

/** Behaves like Drive's `alt=media`: honours Range with 206/Content-Range, else 200. */
export function driveFetchMock(size = FILE_SIZE) {
  const requests: { range: string | null; auth: string | null }[] = [];
  const fn = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const h = init?.headers as Record<string, string>;
    requests.push({ range: h.Range ?? null, auth: h.Authorization ?? null });
    const m = h.Range ? /^bytes=(\d+)-(\d*)$/.exec(h.Range) : null;
    if (!m) {
      return new Response(fakeFileStream(0, size - 1), { status: 200, headers: { "Content-Length": String(size), "Content-Type": "application/octet-stream" } });
    }
    const start = Number(m[1]);
    const end = Math.min(m[2] ? Number(m[2]) : size - 1, size - 1);
    return new Response(fakeFileStream(start, end), {
      status: 206,
      headers: { "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Content-Type": "application/octet-stream" },
    });
  });
  return { fn, requests };
}

export interface Harness {
  deps: StreamDeps;
  limiter: StreamLimiter;
  markMissing: ReturnType<typeof vi.fn>;
  openDrive: ReturnType<typeof vi.fn>;
  setUser(u: StreamUser | HttpError): void;
  setEpisode(e: Partial<StreamEpisode> | null): void;
}

/** Wires handleStream to a Drive mock through the real fetchDriveMedia (so retry/refresh paths are exercised). */
export function makeHarness(opts: { driveFetch?: typeof fetch; maxTotal?: number; maxPerUser?: number } = {}): Harness {
  let user: StreamUser | HttpError = { userId: "user-1", isAdmin: false };
  let episode: StreamEpisode | null = { id: EP_ID, fileId: FILE_ID, mime: "video/mp4", size: FILE_SIZE, fileStatus: "ok", visible: true };
  const limiter = new StreamLimiter(() => opts.maxTotal ?? 15, () => opts.maxPerUser ?? 3);
  const mediaDeps: MediaDeps = {
    fetch: opts.driveFetch ?? (driveFetchMock().fn as unknown as typeof fetch),
    getToken: async (force) => (force ? "fresh-token" : "stale-token"),
    sleep: async () => undefined,
    random: () => 0.5,
  };
  const markMissing = vi.fn(async () => undefined);
  const openDrive = vi.fn(({ fileId, range, ifRange, signal }: { fileId: string; range: string | null; ifRange: string | null; signal: AbortSignal }) =>
    fetchDriveMedia({ fileId, range, ifRange, signal }, mediaDeps),
  );
  const deps: StreamDeps = {
    authenticate: async () => {
      if (user instanceof HttpError) throw user;
      return user;
    },
    getEpisode: async () => episode,
    openDrive,
    markMissing,
    limiter,
  };
  return {
    deps,
    limiter,
    markMissing,
    openDrive,
    setUser: (u) => (user = u),
    setEpisode: (e) => (episode = e === null ? null : { ...(episode ?? ({} as StreamEpisode)), ...e }),
  };
}

export async function readAll(body: ReadableStream<Uint8Array> | null): Promise<{ length: number; first: number; last: number; bytes: Uint8Array }> {
  if (!body) return { length: 0, first: -1, last: -1, bytes: new Uint8Array() };
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    length += value.length;
  }
  const bytes = new Uint8Array(length);
  let o = 0;
  for (const p of parts) {
    bytes.set(p, o);
    o += p.length;
  }
  return { length, first: bytes[0] ?? -1, last: bytes[length - 1] ?? -1, bytes };
}
