import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { readJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rate-limit";
import { parseUuid } from "@/lib/validation/common";
import { updateUserSchema } from "@/lib/validation/user";
import { updateUser } from "@/lib/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = api("admin.users.update", async (request: Request, _r: string, ctx: RouteContext<"/api/admin/users/[id]">) => {
  const { userId } = await requireAdmin();
  rateLimit(`admin-users:${userId}`, 30, 60_000);
  const id = parseUuid((await ctx.params).id);
  const patch = await readJson(request, updateUserSchema);
  return json({ user: await updateUser(userId, id, patch) });
});
