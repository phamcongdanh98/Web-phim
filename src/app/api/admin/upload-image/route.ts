import { randomUUID } from "node:crypto";
import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { badRequest } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Declared Content-Type is client-controlled; verify the real file signature. */
function matchesSignature(type: string, b: Uint8Array): boolean {
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === "image/webp") return String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  return false;
}

/** Poster/backdrop upload into the Supabase Storage `media` bucket (images only, <= 5 MB). */
export const POST = api("admin.upload-image", async (request: Request) => {
  const { userId } = await requireAdmin();
  rateLimit(`upload-img:${userId}`, 30, 60_000);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind") === "backdrop" ? "backdrops" : "posters";
  if (!(file instanceof File)) throw badRequest("Thiếu file ảnh.");
  const ext = TYPES[file.type];
  if (!ext) throw badRequest("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.");
  if (file.size > MAX_BYTES) throw badRequest("Ảnh tối đa 5 MB.");
  if (!matchesSignature(file.type, new Uint8Array(await file.slice(0, 12).arrayBuffer()))) throw badRequest("Nội dung file không phải ảnh hợp lệ.");

  const path = `${kind}/${randomUUID()}.${ext}`;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from("media").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  const { data } = admin.storage.from("media").getPublicUrl(path);
  return json({ url: data.publicUrl });
});
