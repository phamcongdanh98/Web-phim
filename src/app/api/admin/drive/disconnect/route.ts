import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/http/rate-limit";
import { clearAccessTokenCache, decryptRefreshToken } from "@/lib/google-drive/auth";
import { markDisconnected } from "@/lib/google-drive/integration";
import { revokeToken } from "@/lib/google-drive/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api("admin.drive.disconnect", async () => {
  const { userId } = await requireAdmin();
  rateLimit(`admin:${userId}`, 60, 60_000);
  // Best effort: revoke at Google so the token is useless even if it leaked.
  await decryptRefreshToken().then(revokeToken).catch(() => undefined);
  await markDisconnected();
  clearAccessTokenCache();
  await writeAudit(userId, "DRIVE_DISCONNECT", "drive_integration", null);
  return json({ ok: true });
});
