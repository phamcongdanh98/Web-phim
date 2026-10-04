import { describe, expect, it, vi } from "vitest";
import { createRootGuard } from "@/lib/google-drive/folders";
import { DriveError } from "@/lib/google-drive/errors";

// Tree: root > movies > m1 > file1 ; other > file2 ; orphan (no parents)
const tree: Record<string, string[] | null> = {
  movies: ["root"],
  m1: ["movies"],
  file1: ["m1"],
  other: ["elsewhere"],
  elsewhere: [],
  file2: ["other"],
  orphan: [],
  cycleA: ["cycleB"],
  cycleB: ["cycleA"],
  shared: ["other", "m1"], // multiple parents: one inside root is enough
};

function make() {
  const fetcher = vi.fn(async (id: string) => tree[id] ?? null);
  let t = 0;
  const guard = createRootGuard(() => "root", fetcher, { ttlMs: 1000, now: () => t });
  return { guard, fetcher, advance: (ms: number) => (t += ms) };
}

describe("assertInsideRoot", () => {
  it("accepts root and descendants", async () => {
    const { guard } = make();
    await expect(guard.assertInsideRoot("root")).resolves.toBeUndefined();
    await expect(guard.assertInsideRoot("file1")).resolves.toBeUndefined();
  });
  it("rejects files outside, orphans, unknown ids and empty ids", async () => {
    const { guard } = make();
    for (const id of ["file2", "orphan", "does-not-exist", ""]) {
      await expect(guard.assertInsideRoot(id)).rejects.toMatchObject({ kind: "outside_root" });
    }
    await expect(guard.assertInsideRoot("file2")).rejects.toBeInstanceOf(DriveError);
  });
  it("accepts a file with one parent inside root", async () => {
    expect(await make().guard.isInsideRoot("shared")).toBe(true);
  });
  it("terminates on parent cycles", async () => {
    expect(await make().guard.isInsideRoot("cycleA")).toBe(false);
  });
  it("caches folder results and expires them", async () => {
    const { guard, fetcher, advance } = make();
    await guard.isInsideRoot("file1");
    const calls = fetcher.mock.calls.length;
    await guard.isInsideRoot("file1");
    expect(fetcher.mock.calls.length).toBe(calls);
    advance(2000);
    await guard.isInsideRoot("file1");
    expect(fetcher.mock.calls.length).toBeGreaterThan(calls);
  });
});
