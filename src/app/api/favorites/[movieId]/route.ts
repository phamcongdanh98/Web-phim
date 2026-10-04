import { api, json } from "@/lib/http/api";
import { requireUser } from "@/lib/auth";
import { notFound } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { parseUuid } from "@/lib/validation/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/favorites/[movieId]">;

export const PUT = api("favorites.add", async (_req: Request, _rid: string, ctx: Ctx) => {
  const { userId, supabase } = await requireUser();
  rateLimit(`fav:${userId}`, 60, 60_000);
  const movieId = parseUuid((await ctx.params).movieId);
  const { data: movie } = await supabase.from("movies").select("id").eq("id", movieId).maybeSingle(); // RLS: published only
  if (!movie) throw notFound("Không tìm thấy phim.");
  const { error } = await supabase.from("favorites").upsert({ user_id: userId, movie_id: movieId }, { onConflict: "user_id,movie_id" });
  if (error) throw new Error(error.message);
  return json({ favorite: true });
});

export const DELETE = api("favorites.remove", async (_req: Request, _rid: string, ctx: Ctx) => {
  const { userId, supabase } = await requireUser();
  rateLimit(`fav:${userId}`, 60, 60_000);
  const movieId = parseUuid((await ctx.params).movieId);
  const { error } = await supabase.from("favorites").delete().eq("user_id", userId).eq("movie_id", movieId);
  if (error) throw new Error(error.message);
  return json({ favorite: false });
});
