import { describe, expect, it } from "vitest";
import { detectFaststart } from "@/lib/google-drive/mp4";
import { classifyVideo } from "@/lib/google-drive/formats";

function box(type: string, payloadSize: number): Uint8Array {
  const b = new Uint8Array(8 + payloadSize);
  new DataView(b.buffer).setUint32(0, b.length);
  b.set(new TextEncoder().encode(type), 4);
  return b;
}
const cat = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]));

describe("detectFaststart", () => {
  it("true when moov precedes mdat", () => {
    expect(detectFaststart(cat(box("ftyp", 12), box("moov", 100), box("mdat", 50)))).toBe(true);
  });
  it("false when mdat precedes moov", () => {
    expect(detectFaststart(cat(box("ftyp", 12), box("free", 8), box("mdat", 50)))).toBe(false);
  });
  it("null when prefix is not an MP4 or too short", () => {
    expect(detectFaststart(new TextEncoder().encode("not an mp4 file at all"))).toBeNull();
    expect(detectFaststart(box("ftyp", 12))).toBeNull();
  });
});

describe("classifyVideo", () => {
  it("mp4 ok, others warn", () => {
    expect(classifyVideo("video/mp4", "a.mp4").support).toBe("ok");
    expect(classifyVideo("application/octet-stream", "a.mp4")).toMatchObject({ support: "ok", servedMime: "video/mp4" });
    expect(classifyVideo("video/webm", "a.webm").support).toBe("warn");
    expect(classifyVideo("video/x-matroska", "a.mkv").message).toMatch(/không tương thích/);
  });
});
