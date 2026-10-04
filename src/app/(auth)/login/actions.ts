"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/http/rate-limit";
import { safeNextPath } from "@/lib/utils/safe-redirect";
import { headers } from "next/headers";

const schema = z.object({
  email: z.string().trim().email("Email không hợp lệ."),
  password: z.string().min(1, "Vui lòng nhập mật khẩu."),
});

export interface LoginState {
  error?: string;
}

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    rateLimit(`login:${ip}`, 20, 60_000);
    rateLimit(`login:${parsed.data.email.toLowerCase()}`, 8, 60_000);
  } catch {
    return { error: "Bạn thử đăng nhập quá nhiều lần. Vui lòng đợi một phút." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "Email hoặc mật khẩu không đúng." };

  // Disabled accounts must not keep a session.
  const { data: profile } = await createSupabaseAdminClient()
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { error: "Tài khoản của bạn hiện không được phép truy cập hệ thống." };
  }
  await createSupabaseAdminClient().from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", data.user.id);

  redirect(safeNextPath(formData.get("next")?.toString()));
}
