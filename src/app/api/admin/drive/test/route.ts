import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/http/rate-limit";
import { testDriveConnection } from "@/lib/google-drive/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api("admin.drive.test", async () => {
  const { userId } = await requireAdmin();
  rateLimit(`admin:${userId}`, 60, 60_000);
  return json(await testDriveConnection());
});
