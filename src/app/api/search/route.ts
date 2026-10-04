import { api, json } from "@/lib/http/api";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/http/rate-limit";
import { searchMovies } from "@/lib/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api("search", async (request: Request) => {
  const { userId, supabase } = await requireUser();
  rateLimit(`search:${userId}`, 120, 60_000);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.length > 100) return json({ results: [] });
  return json({ results: await searchMovies(supabase, q) });
});
