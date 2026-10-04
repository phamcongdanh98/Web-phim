import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureFolder, rootGuard } from "@/lib/google-drive/client";
import { getRootFolderId } from "@/lib/google-drive/integration";
import type { Movie } from "@/types/db";

/**
 * Ensures `PHIM_WEB/movies/{slug}/` (or `PHIM_WEB/series/{slug}/season-NN/`) exists and returns the target folder ID.
 * Folders are discovered by stable appProperties keys and stored by ID (movies.drive_folder_id), never by name.
 */
export async function ensureUploadFolder(supabase: SupabaseClient, movie: Movie, season: number): Promise<string> {
  const root = getRootFolderId();
  const category = movie.type === "series" ? "series" : "movies";
  const categoryId = await ensureFolder(root, category, `category-${category}`);

  let movieFolder = movie.drive_folder_id;
  if (!movieFolder || !(await rootGuard.isInsideRoot(movieFolder))) {
    movieFolder = await ensureFolder(categoryId, movie.slug, `movie-${movie.id}`);
    await supabase.from("movies").update({ drive_folder_id: movieFolder }).eq("id", movie.id);
  }
  if (movie.type !== "series") return movieFolder;
  return ensureFolder(movieFolder, `season-${String(season).padStart(2, "0")}`, `season-${season}`);
}

/** Drive file names: drop path separators/control chars, keep it short. */
export function sanitizeFileName(name: string): string {
  const clean = name.replace(/[\u0000-\u001f\\/]/g, "_").replace(/^\.+/, "").trim().slice(0, 200);
  return clean || "video.mp4";
}

export const UPLOAD_MIME = /^video\/(mp4|webm|x-matroska|quicktime|x-msvideo|x-m4v)$/;
export const MAX_UPLOAD_BYTES = 200 * 1024 ** 3; // 200 GiB sanity cap
