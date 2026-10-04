import "server-only";
import { google } from "googleapis";
import { serverEnv } from "@/lib/env";
import { DriveError } from "./errors";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

function oauthClient() {
  const env = serverEnv();
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

/** `access_type=offline` + `prompt=consent` guarantee Google returns a refresh token. */
export function buildAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DRIVE_SCOPE],
    state,
    include_granted_scopes: false,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const { tokens } = await oauthClient().getToken(code);
  if (!tokens.refresh_token || !tokens.access_token) {
    throw new DriveError(
      "disconnected",
      "Google không trả về refresh token. Hãy thu hồi quyền của app tại myaccount.google.com/permissions rồi kết nối lại.",
    );
  }
  return { refreshToken: tokens.refresh_token, accessToken: tokens.access_token };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}
