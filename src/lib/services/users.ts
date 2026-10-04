import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { HttpError, notFound } from "@/lib/http/errors";
import { invalidateProfileCache } from "@/lib/auth";
import { writeAudit } from "@/lib/auth/audit";
import { assertNotLastAdmin } from "./user-rules";
import type { Profile } from "@/types/db";

// ~100 years: Supabase has no "ban forever", this is the documented idiom.
const BAN_FOREVER = "876000h";

export async function createUser(
  actorId: string,
  input: { email: string; password: string; display_name?: string; role: "admin" | "user" },
): Promise<Profile> {
  const admin = createSupabaseAdminClient();
  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { display_name: input.display_name },
  });
  if (created.error || !created.data.user) {
    const already = /already|registered|exists/i.test(created.error?.message ?? "");
    throw new HttpError(already ? 409 : 400, already ? "Email này đã được sử dụng." : "Không tạo được tài khoản.", { code: "CREATE_FAILED" });
  }
  const id = created.data.user.id;
  const { data, error } = await admin
    .from("profiles")
    .upsert({ id, email: input.email, display_name: input.display_name || input.email.split("@")[0], role: input.role, is_active: true }, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await writeAudit(actorId, "USER_CREATE", "user", id, { email: input.email, role: input.role });
  return data as Profile;
}

export async function updateUser(
  actorId: string,
  targetId: string,
  patch: { is_active?: boolean; role?: "admin" | "user"; display_name?: string; new_password?: string },
): Promise<Profile> {
  const admin = createSupabaseAdminClient();
  const { data: current } = await admin.from("profiles").select("*").eq("id", targetId).maybeSingle();
  if (!current) throw notFound("Không tìm thấy người dùng.");
  const cur = current as Profile;

  if (patch.role !== undefined || patch.is_active !== undefined) {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true);
    assertNotLastAdmin(cur, { role: patch.role, is_active: patch.is_active }, count ?? 0);
  }

  const columns: Partial<Profile> = {};
  if (patch.is_active !== undefined) columns.is_active = patch.is_active;
  if (patch.role !== undefined) columns.role = patch.role;
  if (patch.display_name !== undefined) columns.display_name = patch.display_name;

  let profile = cur;
  if (Object.keys(columns).length) {
    const { data, error } = await admin.from("profiles").update(columns).eq("id", targetId).select("*").single();
    if (error) throw new Error(error.message);
    profile = data as Profile;
  }

  if (patch.is_active !== undefined) {
    // Defence in depth: also ban at the Auth layer so refresh tokens stop working.
    await admin.auth.admin.updateUserById(targetId, { ban_duration: patch.is_active ? "none" : BAN_FOREVER });
  }
  if (patch.new_password) {
    const r = await admin.auth.admin.updateUserById(targetId, { password: patch.new_password });
    if (r.error) throw new HttpError(400, "Không đặt lại được mật khẩu.", { code: "PASSWORD_FAILED" });
    await writeAudit(actorId, "PASSWORD_RESET", "user", targetId, { email: cur.email });
  }
  invalidateProfileCache(targetId);

  if (patch.role !== undefined && patch.role !== cur.role) await writeAudit(actorId, "ROLE_CHANGE", "user", targetId, { from: cur.role, to: patch.role, email: cur.email });
  if (patch.is_active !== undefined && patch.is_active !== cur.is_active) {
    await writeAudit(actorId, patch.is_active ? "USER_ENABLE" : "USER_DISABLE", "user", targetId, { email: cur.email });
  }
  return profile;
}

export interface UserRow extends Profile {
  last_active: string | null;
}

export async function listUsers(): Promise<UserRow[]> {
  const admin = createSupabaseAdminClient();
  const [{ data: profiles }, { data: activity }] = await Promise.all([
    admin.from("profiles").select("*").order("created_at"),
    admin.from("watch_progress").select("user_id,last_watched_at").order("last_watched_at", { ascending: false }).limit(2000),
  ]);
  const lastWatched = new Map<string, string>();
  for (const a of activity ?? []) if (!lastWatched.has(a.user_id)) lastWatched.set(a.user_id, a.last_watched_at);
  return ((profiles ?? []) as Profile[]).map((p) => {
    const candidates = [p.last_seen_at, lastWatched.get(p.id)].filter(Boolean) as string[];
    return { ...p, last_active: candidates.sort().at(-1) ?? null };
  });
}
