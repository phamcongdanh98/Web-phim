import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { badRequest } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { searchTmdb } from "@/lib/services/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api("admin.tmdb.search", async (request: Request) => {
  const { userId } = await requireAdmin();
  rateLimit(`tmdb:${userId}`, 30, 60_000);
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length > 100) throw badRequest("Từ khóa không hợp lệ.");
  return json({ results: await searchTmdb(q) });
});
