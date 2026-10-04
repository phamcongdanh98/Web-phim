import "server-only";
import { google, type drive_v3 } from "googleapis";
import { decryptSecret } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { DISCONNECTED_MESSAGE, DriveError } from "./errors";
import { getIntegration, markDisconnected } from "./integration";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SAFETY_MARGIN_S = 60;

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Access token lives only in this server process' memory (TTL = expires_in - 60s).
let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

export function clearAccessTokenCache() {
  cached = null;
  inflight = null;
}

/** Returns the plaintext refresh token. Throws `disconnected` if absent/revoked. Never log the result. */
export async function decryptRefreshToken(): Promise<string> {
  const integration = await getIntegration();
  if (!integration || integration.status !== "connected") throw new DriveError("disconnected", DISCONNECTED_MESSAGE);
  return decryptSecret(integration.encrypted_refresh_token);
}

/** Exchanges the refresh token for a fresh access token. `invalid_grant` flips the integration to disconnected. */
export async function refreshAccessToken(): Promise<string> {
  // Single-flight: concurrent Range requests share one refresh call.
  if (inflight) return inflight;
  inflight = (async () => {
    const env = serverEnv();
    const refreshToken = await decryptRefreshToken();
    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
    } catch {
      throw new DriveError("unavailable", "Không kết nối được tới Google.");
    }
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) {
      if (body.error === "invalid_grant") {
        logger.warn("drive_invalid_grant");
        await markDisconnected();
        clearAccessTokenCache();
        throw new DriveError("disconnected", DISCONNECTED_MESSAGE, res.status, "invalid_grant");
      }
      throw new DriveError("unavailable", "Không làm mới được access token Google.", res.status, body.error);
    }
    cached = { token: body.access_token, expiresAt: Date.now() + Math.max(0, (body.expires_in ?? 3600) - SAFETY_MARGIN_S) * 1000 };
    return body.access_token;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function getAccessToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
  if (!opts.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token;
  return refreshAccessToken();
}

/** googleapis Drive v3 client bound to a current access token (we own refresh logic). */
export async function getDriveClient(opts: { forceRefresh?: boolean } = {}): Promise<drive_v3.Drive> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: await getAccessToken(opts) });
  return google.drive({ version: "v3", auth });
}
