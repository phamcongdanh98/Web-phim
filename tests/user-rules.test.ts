import { describe, expect, it } from "vitest";
import { assertNotLastAdmin } from "@/lib/services/user-rules";

const admin = { role: "admin", is_active: true } as const;

describe("assertNotLastAdmin", () => {
  it("blocks demoting or disabling the only active admin", () => {
    expect(() => assertNotLastAdmin(admin, { role: "user" }, 1)).toThrow(/admin cuối/);
    expect(() => assertNotLastAdmin(admin, { is_active: false }, 1)).toThrow(/admin cuối/);
  });
  it("allows it when another active admin exists", () => {
    expect(() => assertNotLastAdmin(admin, { role: "user" }, 2)).not.toThrow();
    expect(() => assertNotLastAdmin(admin, { is_active: false }, 2)).not.toThrow();
  });
  it("ignores non-admins and harmless changes", () => {
    expect(() => assertNotLastAdmin({ role: "user", is_active: true }, { is_active: false }, 1)).not.toThrow();
    expect(() => assertNotLastAdmin(admin, { role: "admin" }, 1)).not.toThrow();
    expect(() => assertNotLastAdmin({ role: "admin", is_active: false }, { role: "user" }, 1)).not.toThrow();
  });
});
