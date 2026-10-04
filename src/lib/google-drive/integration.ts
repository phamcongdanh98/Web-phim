import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import type { DriveIntegration } from "@/types/db";

let cache: { value: DriveIntegration | null; exp: number } | null = null;
const TTL_MS = 15_000;

export function invalidateIntegrationCache() {
  cache = null;
}

/** Reads the (single) Drive integration row with the service role. Never expose the row to clients. */
export async function getIntegration(): Promise<DriveIntegration | null> {
  if (cache && cache.exp > Date.now()) return cache.value;
  const { data, error } = await createSupabaseAdminClient()
    .from("drive_integrations")
    .select("*")
    .eq("provider", "google_drive")
    .maybeSingle();
  if (error) throw new Error(`Không đọc được drive_integrations: ${error.message}`);
  cache = { value: (data as DriveIntegration | null) ?? null, exp: Date.now() + TTL_MS };
  return cache.value;
}

export async function saveIntegration(input: { email: string | null; refreshToken: string }) {
  const { error } = await createSupabaseAdminClient()
    .from("drive_integrations")
    .upsert(
      {
        provider: "google_drive",
        google_account_email: input.email,
        encrypted_refresh_token: encryptSecret(input.refreshToken),
        root_folder_id: serverEnv().GOOGLE_DRIVE_ROOT_FOLDER_ID,
        status: "connected",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
  if (error) throw new Error(`Không lưu được kết nối Drive: ${error.message}`);
  invalidateIntegrationCache();
}

export async function markDisconnected() {
  await createSupabaseAdminClient()
    .from("drive_integrations")
    .update({ status: "disconnected", encrypted_refresh_token: encryptSecret("revoked") })
    .eq("provider", "google_drive");
  invalidateIntegrationCache();
}

/** Root folder used by assertInsideRoot: env is authoritative. */
export function getRootFolderId(): string {
  return serverEnv().GOOGLE_DRIVE_ROOT_FOLDER_ID;
}
