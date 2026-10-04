import { uuidSchema } from "@/lib/validation/common";
import { HttpError } from "@/lib/http/errors";
import { contentRange, parseRange, totalFromContentRange } from "@/lib/http/range";
import { DriveError, USER_STREAM_ERROR, DISCONNECTED_MESSAGE } from "@/lib/google-drive/errors";
import { pipeWithRelease } from "./pipe";
import type { StreamLimiter } from "./limiter";

export interface StreamEpisode {
  id: string;
  fileId: string;
  mime: string | null;
  size: number | null;
  fileStatus: "ok" | "missing" | "error";
  /** episode.published && movie.published */
  visible: boolean;
}

export interface StreamUser {
  userId: string;
  isAdmin: boolean;
}

export interface StreamDeps {
  /** Throws HttpError(401/403). */
  authenticate(): Promise<StreamUser>;
  getEpisode(id: string): Promise<StreamEpisode | null>;
  openDrive(args: { fileId: string; range: string | null; ifRange: string | null; signal: AbortSignal }): Promise<Response>;
  markMissing(id: string): Promise<void>;
  limiter: StreamLimiter;
  rateLimit?(userId: string): void;
  log?(event: string, fields: Record<string, unknown>): void;
}

const BASE_HEADERS = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function jsonError(status: number, message: string, extra: { code?: string; detail?: string; retryAfter?: number } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (extra.retryAfter) headers["Retry-After"] = String(extra.retryAfter);
  return new Response(JSON.stringify({ error: message, code: extra.code, ...(extra.detail ? { detail: extra.detail } : {}) }), { status, headers });
}

/** Maps a Drive failure to an HTTP response. Admins get the real reason; viewers get a generic message. */
function driveFailure(err: DriveError, isAdmin: boolean): Response {
  const detail = isAdmin ? (err.kind === "disconnected" ? DISCONNECTED_MESSAGE : `${err.message}${err.reason ? ` [${err.reason}]` : ""}`) : undefined;
  switch (err.kind) {
    case "rate_limit":
      return jsonError(429, USER_STREAM_ERROR, { code: "DRIVE_RATE_LIMIT", detail, retryAfter: 5 });
    case "quota":
      return jsonError(503, USER_STREAM_ERROR, { code: "DRIVE_QUOTA", detail, retryAfter: 600 });
    case "disconnected":
      return jsonError(503, USER_STREAM_ERROR, { code: "DRIVE_DISCONNECTED", detail });
    case "forbidden":
    case "outside_root":
      return jsonError(502, USER_STREAM_ERROR, { code: "DRIVE_FORBIDDEN", detail });
    case "range_not_satisfiable":
      return jsonError(416, "Range không hợp lệ.", { code: "RANGE" });
    default:
      return jsonError(502, USER_STREAM_ERROR, { code: "DRIVE_UNAVAILABLE", detail });
  }
}

/**
 * Core of GET/HEAD /api/stream/[episodeId]. Framework-free so it can be integration-tested with a Drive mock.
 * Order: auth → UUID → episode → status → Range → (HEAD answers from DB) → limiter → Drive → pipe.
 */
export async function handleStream(request: Request, episodeId: string, deps: StreamDeps): Promise<Response> {
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  let user: StreamUser;
  try {
    user = await deps.authenticate();
    deps.rateLimit?.(user.userId);
  } catch (e) {
    if (e instanceof HttpError) return jsonError(e.status, e.message, { code: e.opts.code, retryAfter: e.opts.retryAfter });
    throw e;
  }

  if (!uuidSchema.safeParse(episodeId).success) return jsonError(400, "episodeId không hợp lệ.", { code: "BAD_REQUEST" });

  const ep = await deps.getEpisode(episodeId);
  // Hide existence of unpublished content from non-admins.
  if (!ep || (!ep.visible && !user.isAdmin)) return jsonError(404, "Không tìm thấy tập phim.", { code: "NOT_FOUND" });
  if (ep.fileStatus === "missing") {
    return jsonError(404, "File video của tập này không còn trên Google Drive.", { code: "FILE_MISSING" });
  }

  const mime = ep.mime && ep.mime.startsWith("video/") ? ep.mime : "video/mp4"; // never trust Drive's octet-stream
  const rangeHeader = request.headers.get("range");
  let size = ep.size;

  // Validate the Range ourselves when the size is known: gives exact 416s without a Drive round trip.
  let parsed = size != null ? parseRange(rangeHeader, size) : null;
  if (size != null && parsed?.kind === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...BASE_HEADERS, "Content-Range": `bytes */${size}` } });
  }

  // HEAD with a known size never touches Drive.
  if (method === "HEAD" && size != null && parsed) {
    const headers: Record<string, string> = { ...BASE_HEADERS, "Content-Type": mime };
    if (parsed.kind === "range") {
      headers["Content-Range"] = contentRange(parsed.start, parsed.end, size);
      headers["Content-Length"] = String(parsed.end - parsed.start + 1);
      return new Response(null, { status: 206, headers });
    }
    headers["Content-Length"] = String(size);
    return new Response(null, { status: 200, headers });
  }

  let release: () => void;
  try {
    release = deps.limiter.acquire(user.userId);
  } catch (e) {
    if (e instanceof HttpError) return jsonError(e.status, e.message, { code: e.opts.code, retryAfter: e.opts.retryAfter });
    throw e;
  }

  let upstream: Response;
  try {
    // Forward a normalised Range (never the raw client header) so Drive only sends the needed bytes.
    const upstreamRange =
      parsed?.kind === "range"
        ? `bytes=${parsed.start}-${parsed.end}`
        : size == null && rangeHeader && /^bytes=\d*-\d*$/.test(rangeHeader.trim())
          ? rangeHeader.trim()
          : null;
    upstream = await deps.openDrive({
      fileId: ep.fileId,
      range: method === "HEAD" ? "bytes=0-0" : upstreamRange,
      ifRange: upstreamRange ? request.headers.get("if-range") : null,
      signal: request.signal,
    });
  } catch (err) {
    release();
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (err instanceof DriveError) {
      deps.log?.("stream_drive_error", { episodeId, kind: err.kind, status: err.status, reason: err.reason });
      if (err.kind === "not_found") {
        await deps.markMissing(episodeId).catch(() => undefined);
        return jsonError(404, "File video của tập này không còn trên Google Drive.", {
          code: "FILE_MISSING",
          detail: user.isAdmin ? "Drive trả 404; tập đã được đánh dấu missing." : undefined,
        });
      }
      return driveFailure(err, user.isAdmin);
    }
    deps.log?.("stream_error", { episodeId, message: err instanceof Error ? err.message : "unknown" });
    return jsonError(502, USER_STREAM_ERROR, { code: "STREAM_ERROR" });
  }

  // Size unknown in DB: learn it from Drive's answer.
  if (size == null) {
    size = totalFromContentRange(upstream.headers.get("content-range")) ?? (upstream.status === 200 ? Number(upstream.headers.get("content-length")) || null : null);
    if (size != null) parsed = parseRange(rangeHeader, size);
  }

  const headers: Record<string, string> = { ...BASE_HEADERS, "Content-Type": mime };
  const etag = upstream.headers.get("etag");
  const lastModified = upstream.headers.get("last-modified");
  if (etag) headers.ETag = etag;
  if (lastModified) headers["Last-Modified"] = lastModified;

  if (method === "HEAD") {
    await upstream.body?.cancel().catch(() => undefined);
    release();
    if (size != null) headers["Content-Length"] = String(size);
    return new Response(null, { status: 200, headers });
  }

  let status = upstream.status;
  if (upstream.status === 206) {
    const cr = upstream.headers.get("content-range");
    if (cr) {
      headers["Content-Range"] = cr;
      const m = /bytes (\d+)-(\d+)\//.exec(cr);
      if (m) headers["Content-Length"] = String(Number(m[2]) - Number(m[1]) + 1);
    } else if (parsed?.kind === "range" && size != null) {
      headers["Content-Range"] = contentRange(parsed.start, parsed.end, size);
      headers["Content-Length"] = String(parsed.end - parsed.start + 1);
    }
  } else {
    // Drive answered 200 (no Range, or If-Range did not match): whole file.
    status = 200;
    const len = upstream.headers.get("content-length") ?? (size != null ? String(size) : null);
    if (len) headers["Content-Length"] = len;
  }

  if (!upstream.body) {
    release();
    return jsonError(502, USER_STREAM_ERROR, { code: "EMPTY_BODY" });
  }
  return new Response(pipeWithRelease(upstream.body, release), { status, headers });
}
