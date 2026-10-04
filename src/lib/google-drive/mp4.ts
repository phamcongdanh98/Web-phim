/**
 * Detects whether an MP4 is "faststart" (moov atom before mdat) by walking top-level boxes
 * in the first bytes of the file. Returns null when undecidable from the given prefix.
 */
export function detectFaststart(head: Uint8Array): boolean | null {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  let offset = 0;
  let sawFtyp = false;
  while (offset + 8 <= head.byteLength) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(head[offset + 4], head[offset + 5], head[offset + 6], head[offset + 7]);
    if (!/^[\x20-\x7e]{4}$/.test(type)) return null; // not an MP4 box stream
    if (type === "ftyp") sawFtyp = true;
    if (type === "moov") return sawFtyp || offset === 0 ? true : null;
    if (type === "mdat") return sawFtyp ? false : null;
    let header = 8;
    if (size === 1) {
      if (offset + 16 > head.byteLength) return null;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      return null; // box extends to EOF without moov/mdat seen
    }
    if (size < header) return null;
    offset += size;
  }
  return null;
}
