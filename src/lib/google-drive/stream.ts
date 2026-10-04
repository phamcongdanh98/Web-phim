import "server-only";
import { getAccessToken } from "./auth";
import { classifyDriveHttpError, DriveError } from "./errors";

const MAX_RETRIES = 3;
const FILE_ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

export interface MediaRequest {
  fileId: string;
  range?: string | null;
  ifRange?: string | null;
  signal?: AbortSignal;
}

export interface MediaDeps {
  fetch: typeof fetch;
  getToken: (forceRefresh?: boolean) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

const defaultDeps: MediaDeps = {
  fetch: (...a) => fetch(...a),
  getToken: (force) => getAccessToken({ forceRefresh: force }),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: Math.random,
};

/** Exponential backoff with jitter: ~0.5s, 1s, 2s (capped 8s), each scaled by 0.5–1.0. */
export function backoffMs(attempt: number, random: () => number): number {
  return Math.min(8000, 500 * 2 ** attempt) * (0.5 + random() / 2);
}

/**
 * Opens a (ranged) media download from Drive. Retry policy mirrors the spec:
 *  - 401 → refresh the token once, retry
 *  - 429 / 5xx / userRateLimitExceeded / network error → up to 3 retries with backoff+jitter
 *  - 404, quota, forbidden → throw immediately
 * Retries only happen here, before any byte reached the client, so they are always safe.
 * The returned Response body is a Web ReadableStream (backpressure is native); the caller pipes it.
 */
export async function fetchDriveMedia(req: MediaRequest, deps: MediaDeps = defaultDeps): Promise<Response> {
  if (!FILE_ID_RE.test(req.fileId)) throw new DriveError("not_found", "File ID không hợp lệ.", 404);
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(req.fileId)}?alt=media&supportsAllDrives=true`;

  let refreshed = false;
  let forceToken = false;
  let attempt = 0;
  for (;;) {
    const token = await deps.getToken(forceToken);
    forceToken = false;
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (req.range) headers.Range = req.range;
    if (req.range && req.ifRange) headers["If-Range"] = req.ifRange;

    let res: Response;
    try {
      res = await deps.fetch(url, { headers, signal: req.signal });
    } catch (e) {
      if (req.signal?.aborted) throw e; // viewer left / seeked: not an error
      if (attempt < MAX_RETRIES) {
        await deps.sleep(backoffMs(attempt++, deps.random));
        continue;
      }
      throw new DriveError("unavailable", "Không kết nối được tới Google Drive.");
    }

    if (res.status === 200 || res.status === 206) return res;

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      forceToken = true;
      await res.body?.cancel();
      continue;
    }

    const body = await res.json().catch(() => null);
    const err = classifyDriveHttpError(res.status, body);
    const retryable = err.kind === "rate_limit" || err.kind === "unavailable";
    if (retryable && attempt < MAX_RETRIES) {
      await deps.sleep(backoffMs(attempt++, deps.random));
      continue;
    }
    throw err;
  }
}
