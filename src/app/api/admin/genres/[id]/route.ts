import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { HttpError, readJson } from "@/lib/http/errors";
import { parseUuid } from "@/lib/validation/common";
import { genreSchema } from "@/lib/validation/movie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = api("admin.genres.update", async (request: Request, _r: string, ctx: RouteContext<"/api/admin/genres/[id]">) => {
  const { supabase } = await requireAdmin();
  const id = parseUuid((await ctx.params).id);
  const input = await readJson(request, genreSchema);
  const { data, error } = await supabase.from("genres").update(input).eq("id", id).select("*").maybeSingle();
  if (error?.code === "23505") throw new HttpError(409, "Slug đã tồn tại.");
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, "Không tìm thấy thể loại.");
  return json({ genre: data });
});

export const DELETE = api("admin.genres.delete", async (_req: Request, _r: string, ctx: RouteContext<"/api/admin/genres/[id]">) => {
  const { supabase } = await requireAdmin();
  const id = parseUuid((await ctx.params).id);
  const { error } = await supabase.from("genres").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
});
