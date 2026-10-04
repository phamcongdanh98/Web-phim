import { backoffDelay, normaliseChunkSize, offsetFromRangeHeader, planChunk, statusProbeRange } from "./protocol";

export interface PutResponse {
  status: number;
  headers: Record<string, string>; // lower-cased names
  body: string;
}

export interface PutOptions {
  onProgress?: (loadedInThisRequest: number) => void;
  signal?: AbortSignal;
}

/** Transport abstraction: XHR in the browser (gives upload progress), a fake Google in tests. */
export type PutTransport = (url: string, headers: Record<string, string>, body: Blob | null, opts: PutOptions) => Promise<PutResponse>;

export class UploadAbortedError extends Error {
  constructor() {
    super("Đã hủy tải lên.");
  }
}

/** Fatal: not worth retrying (bad request, expired session…). */
export class UploadFatalError extends Error {
  constructor(
    message: string,
    public status?: number,
    /** 404/410: the resumable session expired; the caller must start a new one. */
    public sessionExpired = false,
  ) {
    super(message);
  }
}

export interface UploadedFile {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
}

export interface UploaderOptions {
  chunkSize?: number;
  maxRetries?: number;
  transport: PutTransport;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onProgress?: (uploadedBytes: number, total: number) => void;
  /** Called whenever Google confirms a new offset (persist it for resume after a reload). */
  onOffset?: (offset: number) => void;
  onRetry?: (attempt: number, reason: string) => void;
  signal?: AbortSignal;
}

const sleepDefault = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Uploads a File to a Google resumable session URL in chunks, directly from the browser.
 *  - never restarts from 0: after a network/5xx failure it asks Google for the confirmed offset
 *    (`PUT` empty body + `Content-Range: bytes * /TOTAL`) and continues from there;
 *  - only slices one chunk at a time, so memory stays ≈ one chunk even for 20 GB files.
 */
export class ResumableUploader {
  private chunkSize: number;
  private maxRetries: number;
  private sleep: (ms: number) => Promise<void>;
  private random: () => number;

  constructor(
    private file: Blob,
    private uploadUrl: string,
    private opts: UploaderOptions,
  ) {
    this.chunkSize = normaliseChunkSize(opts.chunkSize);
    this.maxRetries = opts.maxRetries ?? 6;
    this.sleep = opts.sleep ?? sleepDefault;
    this.random = opts.random ?? Math.random;
  }

  /** Asks Google how many bytes it has. Returns the offset, or the finished file's info if the upload already completed. */
  async queryStatus(): Promise<{ done: false; offset: number } | { done: true; file: UploadedFile }> {
    const res = await this.opts.transport(
      this.uploadUrl,
      { "Content-Range": statusProbeRange(this.file.size) },
      null,
      { signal: this.opts.signal },
    );
    if (res.status === 308) return { done: false, offset: offsetFromRangeHeader(res.headers["range"]) };
    if (res.status === 200 || res.status === 201) return { done: true, file: this.parseFile(res.body) };
    throw this.failure(res);
  }

  async upload(startOffset = 0): Promise<UploadedFile> {
    const total = this.file.size;
    if (total === 0) throw new UploadFatalError("File rỗng.");
    let offset = startOffset;
    let attempt = 0;
    this.opts.onProgress?.(offset, total);

    while (offset < total) {
      this.throwIfAborted();
      const plan = planChunk(offset, total, this.chunkSize);
      try {
        const res = await this.opts.transport(
          this.uploadUrl,
          { "Content-Range": plan.contentRange },
          this.file.slice(plan.start, plan.end + 1),
          {
            signal: this.opts.signal,
            onProgress: (loaded) => this.opts.onProgress?.(Math.min(total, plan.start + loaded), total),
          },
        );

        if (res.status === 200 || res.status === 201) {
          this.opts.onProgress?.(total, total);
          this.opts.onOffset?.(total);
          return this.parseFile(res.body);
        }
        if (res.status === 308) {
          // Google tells us what it actually persisted; trust it over our own arithmetic.
          offset = offsetFromRangeHeader(res.headers["range"]);
          attempt = 0;
          this.opts.onOffset?.(offset);
          this.opts.onProgress?.(offset, total);
          continue;
        }
        throw this.failure(res);
      } catch (err) {
        if (this.opts.signal?.aborted || err instanceof UploadAbortedError) throw new UploadAbortedError();
        if (err instanceof UploadFatalError) throw err;
        // Retryable: network error or 5xx. Back off, ask Google where we are, continue from there.
        if (++attempt > this.maxRetries) {
          throw new UploadFatalError(`Mất kết nối khi tải lên (đã thử ${this.maxRetries} lần). Có thể tiếp tục sau.`);
        }
        this.opts.onRetry?.(attempt, err instanceof Error ? err.message : "lỗi mạng");
        await this.sleep(backoffDelay(attempt - 1, this.random));
        this.throwIfAborted();
        try {
          const status = await this.queryStatus();
          if (status.done) return status.file;
          offset = status.offset;
          this.opts.onOffset?.(offset);
          this.opts.onProgress?.(offset, total);
        } catch (probeErr) {
          if (probeErr instanceof UploadFatalError) throw probeErr;
          // probe itself failed (still offline): loop will retry the chunk / probe again after backoff
        }
      }
    }
    // Offset reached total without a 200/201: ask Google for the final resource.
    const final = await this.queryStatus();
    if (final.done) return final.file;
    throw new UploadFatalError("Tải lên chưa hoàn tất phía Google.");
  }

  /** Best-effort cancel of the session so Google can free it. */
  async cancelSession(): Promise<void> {
    try {
      await this.opts.transport(this.uploadUrl, { "X-Http-Method-Override": "DELETE" }, null, {});
    } catch {
      /* session expires on its own after a week */
    }
  }

  private parseFile(body: string): UploadedFile {
    try {
      const j = JSON.parse(body) as UploadedFile;
      if (j.id) return j;
    } catch {
      /* fall through */
    }
    throw new UploadFatalError("Google không trả về thông tin file sau khi tải lên.");
  }

  private failure(res: PutResponse): Error {
    if (res.status >= 500 || res.status === 429 || res.status === 0) return new Error(`HTTP ${res.status}`);
    if (res.status === 404 || res.status === 410) {
      return new UploadFatalError("Phiên tải lên đã hết hạn. Hãy bắt đầu lại.", res.status, true);
    }
    return new UploadFatalError(`Google từ chối tải lên (HTTP ${res.status}).`, res.status);
  }

  private throwIfAborted() {
    if (this.opts.signal?.aborted) throw new UploadAbortedError();
  }
}

/** Browser transport using XHR so we get upload progress events and abort support. */
export const xhrTransport: PutTransport = (url, headers, body, opts) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => opts.onProgress?.(e.loaded);
    xhr.onload = () => {
      const h: Record<string, string> = {};
      xhr.getAllResponseHeaders().split("\r\n").forEach((line) => {
        const i = line.indexOf(":");
        if (i > 0) h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      });
      resolve({ status: xhr.status, headers: h, body: xhr.responseText });
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.onabort = () => reject(new UploadAbortedError());
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
