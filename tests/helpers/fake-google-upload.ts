import type { PutResponse, PutTransport } from "@/lib/upload/resumable";
import { CHUNK_UNIT } from "@/lib/upload/protocol";

export interface FakeOptions {
  total: number;
  /** Request numbers (1-based, over all PUTs) that fail with this status instead of being processed. */
  failRequests?: Record<number, number | "network">;
  /** Persist only part of the sent chunk (Google may accept less). */
  partialAcceptOnRequest?: Record<number, number>;
  finalBody?: string;
}

/** Implements the relevant slice of Google's resumable protocol so the uploader is tested against realistic behaviour. */
export function fakeGoogle(opts: FakeOptions) {
  let persisted = 0;
  let requests = 0;
  const log: { range: string; size: number }[] = [];
  const done: PutResponse = { status: 200, headers: {}, body: opts.finalBody ?? JSON.stringify({ id: "FILE123456789", name: "a.mp4", mimeType: "video/mp4", size: String(opts.total) }) };

  const transport: PutTransport = async (_url, headers, body) => {
    requests++;
    const range = headers["Content-Range"];
    log.push({ range, size: body?.size ?? 0 });
    const fail = opts.failRequests?.[requests];
    if (fail === "network") throw new Error("network error");
    if (typeof fail === "number") return { status: fail, headers: {}, body: "" };

    // status probe
    if (/^bytes \*\/\d+$/.test(range)) {
      if (persisted >= opts.total) return done;
      return { status: 308, headers: persisted > 0 ? { range: `bytes=0-${persisted - 1}` } : {}, body: "" };
    }
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range)!;
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (start !== persisted) return { status: 400, headers: {}, body: "bad offset" }; // out-of-order chunk
    const isLast = end + 1 === opts.total;
    if (!isLast && (end - start + 1) % CHUNK_UNIT !== 0) return { status: 400, headers: {}, body: "chunk not multiple of 256KiB" };
    const accepted = opts.partialAcceptOnRequest?.[requests] ?? end - start + 1;
    persisted = start + accepted;
    if (persisted >= opts.total) return done;
    return { status: 308, headers: { range: `bytes=0-${persisted - 1}` }, body: "" };
  };
  return { transport, log, get persisted() { return persisted; }, get requests() { return requests; } };
}
