import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { forbidden, unauthorized } from "@/lib/http/errors";
import type { Profile } from "@/types/db";

export interface AuthContext {
  userId: string;
  profile: Profile;
  /** Supabase client acting as this user (RLS enforced). */
  supabase: SupabaseClient;
}

const PROFILE_TTL_MS = 30_000;
const profileCache = new Map<string, { profile: Profile; exp: number }>();

async function loadProfile(supabase: SupabaseClient, userId: string, useCache: boolean): Promise<Profile | null> {
  const now = Date.now();
  if (useCache) {
    const hit = profileCache.get(userId);
    if (hit && hit.exp > now) return hit.profile;
  }
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const profile = (data as Profile | null) ?? null;
  if (profile) {
    profileCache.set(userId, { profile, exp: now + PROFILE_TTL_MS });
    if (profileCache.size > 500) for (const [k, v] of profileCache) if (v.exp <= now) profileCache.delete(k);
  }
  return profile;
}

/** Call after changing role/is_active so the change applies immediately. */
export function invalidateProfileCache(userId: string) {
  profileCache.delete(userId);
}

/**
 * 401 when not logged in, 403 when the account is disabled.
 *
 * `light: true` verifies the JWT locally via getClaims() and caches the profile for 30s.
 * It is meant for hot paths (HTTP Range requests on /api/stream). Everything else uses
 * getUser(), which asks the Auth server.
 */
export async function requireUser(opts: { light?: boolean } = {}): Promise<AuthContext> {
  const supabase = await createSupabaseServerClient();
  let userId: string | undefined;
  if (opts.light) {
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims?.sub;
  } else {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id;
  }
  if (!userId) throw unauthorized();
  const profile = await loadProfile(supabase, userId, !!opts.light);
  if (!profile || !profile.is_active) throw forbidden("Tài khoản của bạn hiện không được phép truy cập hệ thống.");
  return { userId, profile, supabase };
}

export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.profile.role !== "admin") throw forbidden();
  return ctx;
}

/** For Server Components / pages: returns null instead of throwing. */
export async function getPageAuth(): Promise<{ ctx: AuthContext | null; disabled: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ctx: null, disabled: false };
  const profile = await loadProfile(supabase, data.user.id, false);
  if (!profile || !profile.is_active) return { ctx: null, disabled: true };
  return { ctx: { userId: data.user.id, profile, supabase }, disabled: false };
}

export async function requirePageUser(): Promise<AuthContext> {
  const { ctx, disabled } = await getPageAuth();
  if (ctx) return ctx;
  redirect(disabled ? "/login?error=disabled" : "/login");
}

export async function requirePageAdmin(): Promise<AuthContext> {
  const ctx = await requirePageUser();
  if (ctx.profile.role !== "admin") redirect("/");
  return ctx;
}
