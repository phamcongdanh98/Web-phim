import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("AES-256-GCM", () => {
  it("round-trips and never reveals plaintext in the payload", () => {
    const enc = encryptSecret("1//refresh-token-abc");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("refresh-token");
    expect(decryptSecret(enc)).toBe("1//refresh-token-abc");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });
  it("rejects tampered ciphertext", () => {
    const parts = encryptSecret("secret").split(".");
    parts[3] = Buffer.from("tampered!").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
  it("rejects a wrong key", () => {
    const enc = encryptSecret("secret");
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
  });
  it("rejects keys that are not 32 bytes", () => {
    expect(() => encryptSecret("x", randomBytes(16).toString("base64"))).toThrow(/32 byte/);
  });
});
