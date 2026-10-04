/** Pure helpers for Google's resumable upload protocol (unit-tested). */

export const CHUNK_UNIT = 256 * 1024; // Google requires chunk sizes in multiples of 256 KiB (except the last)
export const DEFAULT_CHUNK = 16 * 1024 * 1024; // 16 MiB

export function normaliseChunkSize(size: number = DEFAULT_CHUNK): number {
  const units = Math.max(1, Math.floor(size / CHUNK_UNIT));
  return units * CHUNK_UNIT;
}

export interface ChunkPlan {
  start: number;
  end: number; // inclusive
  length: number;
  contentRange: string;
}

/** Next chunk to send for a file of `total` bytes starting at `offset`. */
export function planChunk(offset: number, total: number, chunkSize: number): ChunkPlan {
  if (offset < 0 || offset >= total) throw new RangeError("offset ngoài phạm vi file");
  const length = Math.min(chunkSize, total - offset);
  const end = offset + length - 1;
  return { start: offset, end, length, contentRange: `bytes ${offset}-${end}/${total}` };
}

/** `Content-Range` for the "how much do you have?" status probe: empty body, `bytes *​/TOTAL`. */
export const statusProbeRange = (total: number) => `bytes */${total}`;

/**
 * Reads the 308 response's `Range: bytes=0-N` header and returns how many bytes Google has persisted (N+1).
 * No Range header at all means nothing has been received yet (0).
 */
export function offsetFromRangeHeader(range: string | null | undefined): number {
  if (!range) return 0;
  const m = /^bytes=0-(\d+)$/.exec(range.trim());
  return m ? Number(m[1]) + 1 : 0;
}

/** Exponential backoff with jitter (1s, 2s, 4s … capped at 30s). */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  return Math.min(30_000, 1000 * 2 ** attempt) * (0.5 + random() / 2);
}

export function fingerprint(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}
