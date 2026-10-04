import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/auth/audit";
import { readJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { parseUuid } from "@/lib/validation/common";
import { deleteMovieSchema, moviePatchSchema } from "@/lib/validation/movie";
import { updateMovie } from "@/lib/services/movies";
import { deleteMovie } from "@/lib/services/movie-delete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = api("admin.movies.update", async (request: Request, _rid: string, ctx: RouteContext<"/api/admin/movies/[id]">) => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`admin:${userId}`, 60, 60_000);
  const id = parseUuid((await ctx.params).id);
  const input = await readJson(request, moviePatchSchema);
  const movie = await updateMovie(supabase, id, input);
  await writeAudit(userId, "MOVIE_UPDATE", "movie", id, { fields: Object.keys(input) });
  return json({ movie });
});

export const DELETE = api("admin.movies.delete", async (request: Request, _rid: string, ctx: RouteContext<"/api/admin/movies/[id]">) => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`admin:${userId}`, 30, 60_000);
  const id = parseUuid((await ctx.params).id);
  const opts = await readJson(request, deleteMovieSchema);
  const result = await deleteMovie(supabase, id, opts);
  await writeAudit(userId, "MOVIE_DELETE", "movie", id, { title: result.title, driveFilesTrashed: result.driveFilesTrashed });
  return json({ ok: true, ...result });
});
