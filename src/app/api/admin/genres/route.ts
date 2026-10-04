import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { HttpError, readJson } from "@/lib/http/errors";
import { genreSchema } from "@/lib/validation/movie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api("admin.genres.create", async (request: Request) => {
  const { supabase } = await requireAdmin();
  const input = await readJson(request, genreSchema);
  const { data, error } = await supabase.from("genres").insert(input).select("*").single();
  if (error?.code === "23505") throw new HttpError(409, "Slug đã tồn tại.");
  if (error) throw new Error(error.message);
  return json({ genre: data }, { status: 201 });
});
