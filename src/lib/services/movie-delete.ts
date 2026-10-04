import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError, notFound } from "@/lib/http/errors";
import { getStorageProvider } from "@/lib/google-drive/provider";
import { logger } from "@/lib/logger";

/**
 * Deletes a movie from the library. Drive files are only touched when the admin explicitly
 * opted in AND confirmed a second time; each id goes through assertInsideRoot inside the provider.
 */
export async function deleteMovie(
  supabase: SupabaseClient,
  id: string,
  opts: { deleteDriveFiles: boolean; confirmDriveDelete: boolean },
) {
  const { data: movie } = await supabase.from("movies").select("id,title").eq("id", id).maybeSingle();
  if (!movie) throw notFound("Không tìm thấy phim.");
  if (opts.deleteDriveFiles && !opts.confirmDriveDelete) {
    throw new HttpError(400, "Cần xác nhận lần hai để xóa file trên Drive.", { code: "CONFIRM_REQUIRED" });
  }

  let trashed = 0;
  if (opts.deleteDriveFiles) {
    const { data: eps } = await supabase.from("episodes").select("storage_file_id").eq("movie_id", id);
    const provider = getStorageProvider();
    for (const ep of eps ?? []) {
      try {
        await provider.deleteFile(ep.storage_file_id);
        trashed++;
      } catch (e) {
        // A file already gone from Drive must not block removing the library entry.
        logger.warn("drive_delete_failed", { movieId: id, reason: e instanceof Error ? e.message : "unknown" });
      }
    }
  }
  const { error } = await supabase.from("movies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { title: movie.title as string, driveFilesTrashed: trashed };
}
