import { api } from "@/lib/http/api";
import { requireUser } from "@/lib/auth";
import { notFound } from "@/lib/http/errors";
import { parseUuid, isAllowedMediaUrl } from "@/lib/validation/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same-origin WebVTT proxy so `<track>` satisfies `media-src 'self'`. RLS decides who may read the row. */
export const GET = api("subtitles.get", async (_r: Request, _id: string, ctx: RouteContext<"/api/subtitles/[id]">) => {
  const { supabase } = await requireUser();
  const id = parseUuid((await ctx.params).id);
  const { data } = await supabase.from("subtitles").select("url").eq("id", id).maybeSingle();
  if (!data || !isAllowedMediaUrl(data.url)) throw notFound();
  const upstream = await fetch(data.url, { signal: AbortSignal.timeout(10_000) });
  if (!upstream.ok) throw notFound();
  return new Response(upstream.body, {
    headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
});
