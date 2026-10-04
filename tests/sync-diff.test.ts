import { describe, expect, it } from "vitest";
import { diffSync } from "@/lib/services/sync-diff";

describe("diffSync", () => {
  const eps = [
    { id: "e1", storage_file_id: "f1", file_status: "ok", storage_file_name: "a.mp4" },
    { id: "e2", storage_file_id: "f2", file_status: "ok", storage_file_name: "b.mp4" },
    { id: "e3", storage_file_id: "f3", file_status: "missing", storage_file_name: "c.mp4" },
  ];
  const files = [
    { id: "f1", name: "a.mp4", size: 1 },
    { id: "f3", name: "c.mp4", size: 3 },
    { id: "f9", name: "new.mp4", size: 9 },
  ];
  it("classifies new / linked / missing", () => {
    const r = diffSync(files, eps);
    expect(r.newFiles.map((f) => f.id)).toEqual(["f9"]);
    expect(r.linked.map((l) => l.fileId)).toEqual(["f1", "f3"]);
    expect(r.missing.map((m) => m.fileId)).toEqual(["f2"]);
  });
  it("only flips status; never proposes deletions", () => {
    const r = diffSync(files, eps);
    expect(r.markMissing).toEqual(["e2"]);
    expect(r.markRecovered).toEqual(["e3"]);
  });
  it("does not re-mark already missing episodes", () => {
    const r = diffSync([], [{ id: "e3", storage_file_id: "f3", file_status: "missing", storage_file_name: null }]);
    expect(r.markMissing).toEqual([]);
    expect(r.missing).toHaveLength(1);
  });
});
