import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { api } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/auth/audit";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { exchangeCodeForTokens } from "@/lib/google-drive/oauth";
import { saveIntegration } from "@/lib/google-drive/integration";
import { clearAccessTokenCache } from "@/lib/google-drive/auth";
import { rootGuard } from "@/lib/google-drive/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameState(a: string | undefined, b: string | null): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const GET = api("google.callback", async (request: Request, requestId: string) => {
  const { userId } = await requireAdmin();
  const base = serverEnv().NEXT_PUBLIC_APP_URL;
  const back = (status: string, msg?: string) => {
    const url = new URL("/admin/settings", base);
    url.searchParams.set("drive", status);
    if (msg) url.searchParams.set("msg", msg);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: "gdrive_oauth_state", path: "/api/google" });
    return res;
  };

  const { searchParams } = new URL(request.url);
  const nextReq = request as NextRequest;
  const stateCookie = nextReq.cookies?.get("gdrive_oauth_state")?.value;
  if (searchParams.get("error")) return back("error", "Bạn đã từ chối cấp quyền.");
  if (!sameState(stateCookie, searchParams.get("state"))) return back("error", "State không hợp lệ. Hãy thử kết nối lại.");
  const code = searchParams.get("code");
  if (!code) return back("error", "Thiếu mã xác thực từ Google.");

  try {
    const { refreshToken, accessToken } = await exchangeCodeForTokens(code);
    // Verify with the fresh token before persisting anything: account email + access to the root folder.
    const headers = { Authorization: `Bearer ${accessToken}` };
    const about = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", { headers });
    const email = about.ok ? ((await about.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null : null;
    const root = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(serverEnv().GOOGLE_DRIVE_ROOT_FOLDER_ID)}?fields=id,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`,
      { headers },
    );
    const rootBody = root.ok
      ? ((await root.json()) as { mimeType?: string; capabilities?: { canAddChildren?: boolean } })
      : null;
    if (!rootBody || rootBody.mimeType !== "application/vnd.google-apps.folder") {
      return back("error", "Tài khoản Google này không truy cập được folder gốc. Kiểm tra GOOGLE_DRIVE_ROOT_FOLDER_ID.");
    }
    if (!rootBody.capabilities?.canAddChildren) return back("error", "Tài khoản này không có quyền ghi vào folder gốc.");

    await saveIntegration({ email, refreshToken });
    clearAccessTokenCache();
    rootGuard.clear();
    await writeAudit(userId, "DRIVE_CONNECT", "drive_integration", null, { email });
    return back("connected");
  } catch (e) {
    logger.error("google_callback_failed", { requestId, message: e instanceof Error ? e.message : "unknown" });
    return back("error", e instanceof Error ? e.message : "Kết nối Google Drive thất bại.");
  }
});
