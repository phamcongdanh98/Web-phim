import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorageProvider } from "@/lib/google-drive/provider";
import { classifyVideo, isVideoFile } from "@/lib/google-drive/formats";
import { detectFaststart } from "@/lib/google-drive/mp4";
import { DriveError } from "@/lib/google-drive/errors";
import { HttpError, badRequest, notFound } from "@/lib/http/errors";
import { assertSeriesOrSingle } from "@/lib/services/movies";
import type { Episode, Movie } from "@/types/db";

const HEAD_BYTES = 512 * 1024;

/** Reads only the first ~512 KB with a Range request (never the whole file) and inspects the MP4 boxes. */
export async function inspectFaststart(fileId: string): Promise<boolean | null> {
  const res = await getStorageProvider().getStream(fileId, `bytes=0-${HEAD_BYTES - 1}`);
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined); // stop the download if Drive ignored Range
  }
  const head = new Uint8Array(Math.min(total, HEAD_BYTES));
  let off = 0;
  for (const c of chunks) {
    const slice = c.subarray(0, Math.max(0, head.length - off));
    head.set(slice, off);
    off += slice.length;
  }
  return detectFaststart(head);
}

export interface LinkInput {
  fileId: string;
  movieId: string;
  season: number;
  episode: number;
  title?: string | null;
}

export async function linkDriveFile(
  supabase: SupabaseClient,
  input: LinkInput,
): Promise<{ episode: Episode; warnings: string[] }> {
  const { data: movie } = await supabase.from("movies").select("*").eq("id", input.movieId).maybeSingle();
  if (!movie) throw notFound("Không tìm thấy phim.");

  const meta = await getStorageProvider().getMetadata(input.fileId); // asserts inside root
  if (meta.isFolder || !isVideoFile(meta.mimeType, meta.name)) throw badRequest("Đây không phải file video.");

  const { data: existing } = await supabase.from("episodes").select("id").eq("storage_file_id", input.fileId).maybeSingle();
  if (existing) throw new HttpError(409, "File này đã được liên kết với một tập khác.", { code: "ALREADY_LINKED" });

  if ((movie as Movie).type === "movie") {
    const { count } = await supabase.from("episodes").select("id", { count: "exact", head: true }).eq("movie_id", input.movieId);
    assertSeriesOrSingle(movie as Movie, count ?? 0);
  }

  const format = classifyVideo(meta.mimeType, meta.name);
  const warnings: string[] = [];
  if (format.message) warnings.push(format.message);

  let faststart: boolean | null = null;
  if (format.servedMime === "video/mp4") {
    try {
      faststart = await inspectFaststart(input.fileId);
    } catch (e) {
      if (e instanceof DriveError && e.kind !== "unavailable") throw e;
    }
    if (faststart === false) {
      warnings.push("File MP4 chưa faststart (moov nằm sau mdat) nên có thể khởi động và tua chậm.");
    }
  }

  const { data, error } = await supabase
    .from("episodes")
    .insert({
      movie_id: input.movieId,
      season_number: (movie as Movie).type === "movie" ? 1 : input.season,
      episode_number: (movie as Movie).type === "movie" ? 1 : input.episode,
      title: input.title ?? null,
      storage_provider: "google_drive",
      storage_file_id: input.fileId,
      storage_file_name: meta.name,
      mime_type: format.servedMime,
      file_size: meta.size,
      faststart,
      file_status: "ok",
      sort_order: input.season * 10_000 + input.episode,
    })
    .select("*")
    .single();
  if (error?.code === "23505") throw new HttpError(409, "Mùa/tập này đã tồn tại trong phim.", { code: "EPISODE_EXISTS" });
  if (error) throw new Error(error.message);
  return { episode: data as Episode, warnings };
}
