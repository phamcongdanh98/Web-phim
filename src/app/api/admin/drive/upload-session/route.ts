import { z } from "zod";
import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { HttpError, badRequest, notFound, readJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { serverEnv } from "@/lib/env";
import { getStorageProvider } from "@/lib/google-drive/provider";
import { DEFAULT_CHUNK } from "@/lib/upload/protocol";
import { ensureUploadFolder, MAX_UPLOAD_BYTES, sanitizeFileName, UPLOAD_MIME } from "@/lib/services/drive-folders";
import { assertSeriesOrSingle } from "@/lib/services/movies";
import type { Movie } from "@/types/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().regex(UPLOAD_MIME, "Chỉ hỗ trợ video MP4, WebM, MKV, MOV, AVI."),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  movieId: z.string().uuid(),
  season: z.number().int().min(0).max(999).default(1),
  episode: z.number().int().min(0).max(9999).default(1),
});

/**
 * Step 1 of a browser → Google direct upload. The server (which holds the OAuth token) opens the
 * resumable session and returns only the session URL; the browser never sees a Google token.
 */
export const POST = api("admin.drive.upload-session", async (request: Request) => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`drive-upload:${userId}`, 20, 60_000);
  const input = await readJson(request, schema);

  const { data: movie } = await supabase.from("movies").select("*").eq("id", input.movieId).maybeSingle();
  if (!movie) throw notFound("Không tìm thấy phim.");
  const m = movie as Movie;

  // Fail before uploading gigabytes if the slot is taken.
  const { data: eps } = await supabase.from("episodes").select("season_number,episode_number").eq("movie_id", m.id);
  if (m.type === "movie") assertSeriesOrSingle(m, eps?.length ?? 0);
  else if (eps?.some((e) => e.season_number === input.season && e.episode_number === input.episode)) {
    throw new HttpError(409, "Mùa/tập này đã có file.", { code: "EPISODE_EXISTS" });
  }
  if (input.size < 1) throw badRequest();

  const parentId = await ensureUploadFolder(supabase, m, input.season);
  // Google binds the session to this Origin; without it the browser's PUT fails CORS.
  const origin = new URL(serverEnv().NEXT_PUBLIC_APP_URL).origin;
  const uploadUrl = await getStorageProvider().createUploadSession({
    name: sanitizeFileName(input.filename),
    mimeType: input.mimeType,
    size: input.size,
    parentId,
    origin,
  });
  return json({ uploadUrl, chunkSize: DEFAULT_CHUNK, folderId: parentId });
});
