import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { parseUuid } from "@/lib/validation/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = api("admin.subtitles.delete", async (_r: Request, _id: string, ctx: RouteContext<"/api/admin/subtitles/[id]">) => {
  const { supabase } = await requireAdmin();
  const id = parseUuid((await ctx.params).id);
  const { error } = await supabase.from("subtitles").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
});
