import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/http/rate-limit";
import { forbidden, unauthorized } from "@/lib/http/errors";

const EP = "123e4567-e89b-42d3-a456-426614174000";
const MOVIE = "223e4567-e89b-42d3-a456-426614174000";

interface Call { table: string; op: string; args: unknown[] }
const calls: Call[] = [];
let visible = true; // does RLS let this user see the episode/movie?
let authError: Error | null = null;

/** Minimal chainable stand-in for the Supabase query builder. */
function builder(table: string) {
  const chain: Record<string, unknown> = {};
  const rec = (op: string) => (...args: unknown[]) => {
    calls.push({ table, op, args });
    return chain;
  };
  for (const op of ["select", "eq", "in", "upsert", "delete"]) chain[op] = rec(op);
  chain.maybeSingle = async () => ({ data: visible ? { id: "x" } : null, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return chain;
}

vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (authError) throw authError;
    return { userId: "user-1", profile: { role: "user" }, supabase: { from: builder } };
  },
}));

beforeEach(() => {
  calls.length = 0;
  visible = true;
  authError = null;
  resetRateLimits();
});

const json = (body: unknown) => new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(body) });

describe("PUT /api/progress/[episodeId]", () => {
  it("saves normalised progress with completed >= 92%", async () => {
    const { PUT } = await import("@/app/api/progress/[episodeId]/route");
    const res = await PUT(json({ positionSeconds: 950, durationSeconds: 1000 }), { params: Promise.resolve({ episodeId: EP }) } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ completed: true, percentage: 95 });
    const up = calls.find((c) => c.op === "upsert")!;
    expect(up.table).toBe("watch_progress");
    expect(up.args[0]).toMatchObject({ user_id: "user-1", episode_id: EP, position_seconds: 950, completed: true });
  });
  it("401 when logged out, 403 when disabled", async () => {
    const { PUT } = await import("@/app/api/progress/[episodeId]/route");
    authError = unauthorized();
    expect((await PUT(json({ positionSeconds: 1, durationSeconds: 2 }), { params: Promise.resolve({ episodeId: EP }) } as never)).status).toBe(401);
    authError = forbidden();
    expect((await PUT(json({ positionSeconds: 1, durationSeconds: 2 }), { params: Promise.resolve({ episodeId: EP }) } as never)).status).toBe(403);
  });
  it("400 on invalid body or non-uuid id", async () => {
    const { PUT } = await import("@/app/api/progress/[episodeId]/route");
    expect((await PUT(json({ positionSeconds: -5, durationSeconds: 2 }), { params: Promise.resolve({ episodeId: EP }) } as never)).status).toBe(400);
    expect((await PUT(json({ positionSeconds: 1, durationSeconds: 2 }), { params: Promise.resolve({ episodeId: "nope" }) } as never)).status).toBe(400);
  });
  it("404 when the episode is not visible to the user (RLS), nothing written", async () => {
    const { PUT } = await import("@/app/api/progress/[episodeId]/route");
    visible = false;
    expect((await PUT(json({ positionSeconds: 1, durationSeconds: 2 }), { params: Promise.resolve({ episodeId: EP }) } as never)).status).toBe(404);
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
  });
  it("429 + Retry-After after 20 saves per minute", async () => {
    const { PUT } = await import("@/app/api/progress/[episodeId]/route");
    let last!: Response;
    for (let i = 0; i < 21; i++) last = await PUT(json({ positionSeconds: i, durationSeconds: 100 }), { params: Promise.resolve({ episodeId: EP }) } as never);
    expect(last.status).toBe(429);
    expect(last.headers.get("Retry-After")).toBeTruthy();
  });
  it("accepts POST (sendBeacon) with the same logic", async () => {
    const { POST } = await import("@/app/api/progress/[episodeId]/route");
    const req = new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ positionSeconds: 10, durationSeconds: 100 }) });
    expect((await POST(req, { params: Promise.resolve({ episodeId: EP }) } as never)).status).toBe(200);
  });
});

describe("favorites", () => {
  it("PUT adds scoped to the current user, DELETE removes only own row", async () => {
    const { PUT, DELETE } = await import("@/app/api/favorites/[movieId]/route");
    const ctx = { params: Promise.resolve({ movieId: MOVIE }) } as never;
    expect(await (await PUT(new Request("http://localhost/x", { method: "PUT" }), ctx)).json()).toEqual({ favorite: true });
    expect(calls.find((c) => c.op === "upsert")!.args[0]).toEqual({ user_id: "user-1", movie_id: MOVIE });
    calls.length = 0;
    expect(await (await DELETE(new Request("http://localhost/x", { method: "DELETE" }), ctx)).json()).toEqual({ favorite: false });
    const eqs = calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["user_id", "user-1"]);
    expect(eqs).toContainEqual(["movie_id", MOVIE]);
  });
  it("404 for unpublished/unknown movie, 401 logged out", async () => {
    const { PUT } = await import("@/app/api/favorites/[movieId]/route");
    visible = false;
    expect((await PUT(new Request("http://localhost/x", { method: "PUT" }), { params: Promise.resolve({ movieId: MOVIE }) } as never)).status).toBe(404);
    authError = unauthorized();
    expect((await PUT(new Request("http://localhost/x", { method: "PUT" }), { params: Promise.resolve({ movieId: MOVIE }) } as never)).status).toBe(401);
  });
});
