import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type AuditAction =
  | "MOVIE_CREATE"
  | "MOVIE_UPDATE"
  | "MOVIE_DELETE"
  | "DRIVE_UPLOAD"
  | "DRIVE_SYNC"
  | "DRIVE_LINK"
  | "DRIVE_CONNECT"
  | "DRIVE_DISCONNECT"
  | "USER_CREATE"
  | "USER_DISABLE"
  | "USER_ENABLE"
  | "ROLE_CHANGE"
  | "PASSWORD_RESET";

/** Best-effort audit trail: a failed log write must never fail the user action. */
export async function writeAudit(
  userId: string | null,
  action: AuditAction,
  entityType: string | null,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await createSupabaseAdminClient()
    .from("audit_logs")
    .insert({ user_id: userId, action, entity_type: entityType, entity_id: entityId, metadata });
  if (error) logger.error("audit_write_failed", { action, message: error.message });
}
