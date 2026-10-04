import { z } from "zod";
import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/auth/audit";
import { HttpError, readJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { getStorageProvider } from "@/lib/google-drive/provider";
import { UPLOAD_MIME } from "@/lib/services/drive-folders";
import { linkDriveFile } from "@/lib/services/drive-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  fileId: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/),
  expectedSize: z.number().int().positive(),
  movieId: z.string().uuid(),
  season: z.number().int().min(0).max(999).default(1),
  episode: z.number().int().min(0).max(9999).default(1),
  title: z.string().trim().max(200).nullish(),
});

/**
 * Step 3: the browser says "done". We do not trust it: re-read the file from Drive, confirm it is under the
 * root, the size matches and the MIME is a video — only then write the episode. Any failure writes nothing.
 */
export const POST = api("admin.drive.upload-complete", async (request: Request) => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`drive-upload:${userId}`, 60, 60_000);
  const input = await readJson(request, schema);

  const meta = await getStorageProvider().getMetadata(input.fileId); // asserts inside root
  if (meta.size !== input.expectedSize) {
    throw new HttpError(422, `Dung lượng file trên Drive (${meta.size ?? "?"}) không khớp với file đã chọn (${input.expectedSize}).`, { code: "SIZE_MISMATCH" });
  }
  if (!UPLOAD_MIME.test(meta.mimeType)) throw new HttpError(422, "Định dạng file trên Drive không hợp lệ.", { code: "BAD_MIME" });

  const result = await linkDriveFile(supabase, { fileId: input.fileId, movieId: input.movieId, season: input.season, episode: input.episode, title: input.title ?? null });
  await writeAudit(userId, "DRIVE_UPLOAD", "episode", result.episode.id, { fileId: input.fileId, size: meta.size, movieId: input.movieId });
  return json(result, { status: 201 });
});
