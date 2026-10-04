import { randomUUID } from "node:crypto";
import { z } from "zod";
import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { badRequest } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseUuid } from "@/lib/validation/common";
import { toVtt } from "@/lib/utils/subtitles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;
const meta = z.object({
  language: z.string().trim().min(2).max(10),
  label: z.string().trim().min(1).max(60),
  is_default: z.enum(["true", "false"]).default("false"),
});

/** Uploads a .vtt/.srt subtitle (stored as WebVTT in Supabase Storage). */
export const POST = api("admin.subtitles.create", async (request: Request, _r: string, ctx: RouteContext<"/api/admin/episodes/[id]/subtitles">) => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`admin:${userId}`, 30, 60_000);
  const episodeId = parseUuid((await ctx.params).id);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Thiếu file phụ đề.");
  if (!/\.(vtt|srt)$/i.test(file.name)) throw badRequest("Chỉ hỗ trợ .vtt hoặc .srt.");
  if (file.size > MAX_BYTES) throw badRequest("Phụ đề tối đa 2 MB.");
  const m = meta.parse({
    language: form?.get("language"),
    label: form?.get("label"),
    is_default: form?.get("is_default") ?? "false",
  });

  const { data: ep } = await supabase.from("episodes").select("id").eq("id", episodeId).maybeSingle();
  if (!ep) throw badRequest("Tập không tồn tại.");

  const vtt = toVtt(await file.text());
  const path = `subtitles/${episodeId}/${randomUUID()}.vtt`;
  const admin = createSupabaseAdminClient();
  const up = await admin.storage.from("media").upload(path, new Blob([vtt], { type: "text/vtt" }), { contentType: "text/vtt" });
  if (up.error) throw new Error(up.error.message);
  const url = admin.storage.from("media").getPublicUrl(path).data.publicUrl;

  if (m.is_default === "true") await supabase.from("subtitles").update({ is_default: false }).eq("episode_id", episodeId);
  const { data, error } = await supabase
    .from("subtitles")
    .insert({ episode_id: episodeId, language: m.language, label: m.label, url, is_default: m.is_default === "true" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return json({ subtitle: data }, { status: 201 });
});
