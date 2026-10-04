import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + DB reachability. Exposes no secrets or config values. */
export async function GET() {
  let db: "ok" | "error" = "error";
  try {
    const { error } = await createSupabaseAdminClient().from("genres").select("id", { head: true, count: "exact" });
    db = error ? "error" : "ok";
  } catch {
    db = "error";
  }
  return NextResponse.json({ app: "ok", db }, { status: db === "ok" ? 200 : 503 });
}
