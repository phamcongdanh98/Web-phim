import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "@/lib/http/origin";
import { logger } from "@/lib/logger";
import { HttpError } from "@/lib/http/errors";

const req = (method: string, headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/x", { method, headers });

describe("assertSameOrigin", () => {
  const app = "https://movies.example.com";
  it("allows same-origin and header-less requests", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "https://movies.example.com" }), app)).not.toThrow();
    expect(() => assertSameOrigin(req("POST"), app)).not.toThrow();
    expect(() => assertSameOrigin(req("GET", { origin: "https://evil.example" }), app)).not.toThrow();
  });
  it("blocks cross-origin state-changing requests with 403", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      try {
        assertSameOrigin(req(m, { origin: "https://evil.example" }), app);
        expect.unreachable();
      } catch (e) {
        expect((e as HttpError).status).toBe(403);
      }
    }
  });
  it("accepts the forwarded host behind a reverse proxy", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "https://movies.example.com", "x-forwarded-host": "movies.example.com" }), undefined)).not.toThrow();
  });
});

describe("logger never prints secrets", () => {
  it("redacts sensitive keys (checked via the module's output)", async () => {
    const lines: string[] = [];
    const orig = console.log;
    const env = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    console.log = (l: string) => lines.push(l);
    try {
      logger.info("evt", { password: "hunter2", access_token: "ya29.x", uploadUrl: "https://u", nested: { client_secret: "s", ok: 1 }, route: "r" });
    } finally {
      console.log = orig;
      (process.env as Record<string, string>).NODE_ENV = env!;
    }
    const out = lines.join("");
    expect(out).not.toMatch(/hunter2|ya29|https:\/\/u|"s"/);
    expect(out).toContain('"route":"r"');
    expect(out).toContain('"ok":1');
  });
});
