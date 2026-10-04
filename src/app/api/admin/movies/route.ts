import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/auth/audit";
import { readJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { movieInputSchema } from "@/lib/validation/movie";
import { createMovie } from "@/lib/services/movies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api("admin.movies.create", async (request: Request) => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`admin:${userId}`, 60, 60_000);
  const input = await readJson(request, movieInputSchema);
  const movie = await createMovie(supabase, userId, input);
  await writeAudit(userId, "MOVIE_CREATE", "movie", movie.id, { title: movie.title });
  return json({ movie }, { status: 201 });
});
