import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { badRequest } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { getTmdbDetail } from "@/lib/services/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api("admin.tmdb.detail", async (request: Request, _r: string, ctx: RouteContext<"/api/admin/tmdb/[id]">) => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`tmdb:${userId}`, 30, 60_000);
  const id = Number((await ctx.params).id);
  const type = new URL(request.url).searchParams.get("type") === "series" ? "series" : "movie";
  if (!Number.isInteger(id) || id <= 0) throw badRequest("TMDB id không hợp lệ.");
  const detail = await getTmdbDetail(type, id);
  const { data: genres } = await supabase.from("genres").select("id,slug").in("slug", detail.genre_slugs);
  return json({ ...detail, genre_ids: (genres ?? []).map((g) => g.id) });
});
