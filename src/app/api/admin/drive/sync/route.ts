import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/http/rate-limit";
import { syncDrive } from "@/lib/services/drive-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = api("admin.drive.sync", async () => {
  const { userId, supabase } = await requireAdmin();
  rateLimit(`drive-sync:${userId}`, 6, 60_000);
  const report = await syncDrive(supabase);
  await writeAudit(userId, "DRIVE_SYNC", "drive", null, {
    new: report.newFiles.length,
    linked: report.linked.length,
    missing: report.missing.length,
  });
  return json(report);
});
