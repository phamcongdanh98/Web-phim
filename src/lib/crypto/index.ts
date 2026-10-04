import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function getKey(keyB64 = process.env.APP_ENCRYPTION_KEY): Buffer {
  if (!keyB64) throw new Error("APP_ENCRYPTION_KEY chưa được cấu hình.");
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY phải là 32 byte (base64). Tạo bằng: openssl rand -base64 32");
  return key;
}

/** AES-256-GCM. Output: `v1.<iv>.<authTag>.<ciphertext>` (all base64url). Fresh random 96-bit IV per call. */
export function encryptSecret(plaintext: string, keyB64?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(keyB64), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(payload: string, keyB64?: string): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error("Định dạng dữ liệu mã hóa không hợp lệ.");
  const decipher = createDecipheriv("aes-256-gcm", getKey(keyB64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  // GCM verifies the auth tag in final(); tampering or a wrong key throws here.
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
