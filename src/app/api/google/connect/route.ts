import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { api } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/google-drive/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api("google.connect", async () => {
  await requireAdmin();
  // Random state in an httpOnly cookie, compared on callback (CSRF protection).
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("gdrive_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return res;
});
