import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { readJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { createUserSchema } from "@/lib/validation/user";
import { createUser } from "@/lib/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api("admin.users.create", async (request: Request) => {
  const { userId } = await requireAdmin();
  rateLimit(`admin-users:${userId}`, 20, 60_000);
  const input = await readJson(request, createUserSchema);
  return json({ user: await createUser(userId, input) }, { status: 201 });
});
