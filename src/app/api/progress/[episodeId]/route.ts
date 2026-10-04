import { api, json } from "@/lib/http/api";
import { requireUser } from "@/lib/auth";
import { notFound, readJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { parseUuid } from "@/lib/validation/common";
import { progressSchema } from "@/lib/validation/user";
import { computeProgress } from "@/lib/utils/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/progress/[episodeId]">;

async function save(request: Request, _rid: string, ctx: Ctx) {
  const { userId, supabase } = await requireUser();
  // Clients save every ~12s; 20/min leaves headroom for pause / visibility / unload saves.
  rateLimit(`progress:${userId}`, 20, 60_000);
  const episodeId = parseUuid((await ctx.params).episodeId);
  const body = await readJson(request, progressSchema);

  // RLS on episodes: users can only see published episodes of published movies.
  const { data: ep } = await supabase.from("episodes").select("id").eq("id", episodeId).maybeSingle();
  if (!ep) throw notFound("Không tìm thấy tập phim.");

  const p = computeProgress(body);
  const { error } = await supabase.from("watch_progress").upsert(
    { user_id: userId, episode_id: episodeId, ...p, last_watched_at: new Date().toISOString() },
    { onConflict: "user_id,episode_id" },
  );
  if (error) throw new Error(error.message);
  return json({ ok: true, percentage: p.percentage, completed: p.completed });
}

export const PUT = api("progress.put", save);
// navigator.sendBeacon can only POST; same handler.
export const POST = api("progress.post", save);
