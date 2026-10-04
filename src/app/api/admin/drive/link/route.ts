import { z } from "zod";
import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/auth/audit";
import { readJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { linkDriveFile } from "@/lib/services/drive-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  fileId: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/),
  movieId: z.string().uuid(),
  season: z.number().int().min(0).max(999).default(1),
  episode: z.number().int().min(0).max(9999).default(1),
  title: z.string().trim().max(200).nullish(),
});

/** Links an existing Drive file to an episode. Only the file ID is stored; nothing is copied. */
export const POST = api("admin.drive.link", async (request: Request) => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`drive:${userId}`, 60, 60_000);
  const input = await readJson(request, schema);
  const result = await linkDriveFile(supabase, input);
  await writeAudit(userId, "DRIVE_LINK", "episode", result.episode.id, { fileId: input.fileId, movieId: input.movieId });
  return json(result, { status: 201 });
});
