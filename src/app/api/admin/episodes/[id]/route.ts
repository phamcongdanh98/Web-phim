import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { HttpError, notFound, readJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { parseUuid } from "@/lib/validation/common";
import { episodePatchSchema } from "@/lib/validation/movie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = api("admin.episodes.update", async (request: Request, _r: string, ctx: RouteContext<"/api/admin/episodes/[id]">) => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`admin:${userId}`, 60, 60_000);
  const id = parseUuid((await ctx.params).id);
  const patch = await readJson(request, episodePatchSchema);
  const { data, error } = await supabase.from("episodes").update(patch).eq("id", id).select("*").maybeSingle();
  if (error?.code === "23505") throw new HttpError(409, "Mùa/tập này đã tồn tại.");
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Không tìm thấy tập.");
  return json({ episode: data });
});

/** Removes the episode from the library only. Drive files are deleted exclusively via movie delete. */
export const DELETE = api("admin.episodes.delete", async (_req: Request, _r: string, ctx: RouteContext<"/api/admin/episodes/[id]">) => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`admin:${userId}`, 60, 60_000);
  const id = parseUuid((await ctx.params).id);
  const { error } = await supabase.from("episodes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
});
