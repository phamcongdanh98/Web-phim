export type ParsedRange =
  | { kind: "full" }
  | { kind: "range"; start: number; end: number } // inclusive, already clamped to the file
  | { kind: "unsatisfiable" };

/**
 * Parses a single-range HTTP `Range: bytes=...` header against a known file size (RFC 9110 §14).
 *  - `bytes=0-499`   first 500 bytes
 *  - `bytes=500-`    from 500 to the end
 *  - `bytes=-500`    last 500 bytes
 * Multi-range, other units and malformed values are ignored (served as a full 200), which RFC 9110 allows.
 * Valid syntax but start beyond EOF → unsatisfiable (416).
 */
export function parseRange(header: string | null | undefined, size: number): ParsedRange {
  if (!header) return { kind: "full" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return { kind: "full" };
  const [, a, b] = m;
  if (a === "" && b === "") return { kind: "full" };

  if (a === "") {
    // suffix range: last N bytes
    const n = Number(b);
    if (!Number.isSafeInteger(n) || n === 0) return { kind: "unsatisfiable" };
    return { kind: "range", start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (!Number.isSafeInteger(start)) return { kind: "unsatisfiable" };
  if (start >= size) return { kind: "unsatisfiable" };
  let end = b === "" ? size - 1 : Number(b);
  if (!Number.isSafeInteger(end) || end < start) return { kind: "full" }; // invalid (last < first): ignore header
  end = Math.min(end, size - 1);
  return { kind: "range", start, end };
}

export function contentRange(start: number, end: number, size: number): string {
  return `bytes ${start}-${end}/${size}`;
}

/** Extracts the total size from `Content-Range: bytes a-b/total`. */
export function totalFromContentRange(value: string | null): number | null {
  const m = value ? /\/(\d+)$/.exec(value) : null;
  return m ? Number(m[1]) : null;
}
