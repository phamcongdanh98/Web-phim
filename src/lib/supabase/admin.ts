import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Service-role client: bypasses RLS. Server-only; every caller must have
 * already authorised the request (requireAdmin / requireUser).
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (!client) {
    const env = serverEnv();
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
