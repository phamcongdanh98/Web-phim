import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TtlLru } from "@/lib/utils/lru";
import type { StreamEpisode } from "./handler";

const cache = new TtlLru<string, StreamEpisode | null>(500, 60_000);

/**
 * `episodeId → { fileId, mime, size, visible }`, LRU with ~60s TTL so seeking (many Range requests)
 * does not hit the DB each time. Uses the service role purely as a lookup; the caller applies the
 * per-user visibility rule (`visible || admin`) on every request.
 */
export async function getStreamEpisode(id: string): Promise<StreamEpisode | null> {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  const { data } = await createSupabaseAdminClient()
    .from("episodes")
    .select("id,storage_file_id,mime_type,file_size,file_status,published,movies!inner(published)")
    .eq("id", id)
    .maybeSingle();
  let value: StreamEpisode | null = null;
  if (data) {
    const movie = data.movies as unknown as { published: boolean } | { published: boolean }[];
    const moviePublished = Array.isArray(movie) ? movie[0]?.published : movie.published;
    value = {
      id: data.id,
      fileId: data.storage_file_id,
      mime: data.mime_type,
      size: data.file_size == null ? null : Number(data.file_size),
      fileStatus: data.file_status,
      visible: !!data.published && !!moviePublished,
    };
  }
  cache.set(id, value);
  return value;
}

export async function markEpisodeMissing(id: string) {
  await createSupabaseAdminClient().from("episodes").update({ file_status: "missing" }).eq("id", id);
  cache.delete(id);
}
