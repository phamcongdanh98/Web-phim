import { forbidden } from "./errors";

/**
 * CSRF defence in depth (on top of SameSite=Lax cookies): browsers always send `Origin` on
 * cross-site state-changing requests. If present it must match our own host.
 * Requests without Origin (curl, server-to-server, same-origin GET) are not browsers-in-attack and pass.
 */
export function assertSameOrigin(request: Request, appUrl = process.env.NEXT_PUBLIC_APP_URL): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Origin không hợp lệ.");
  }
  const allowed = new Set<string>();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) allowed.add(host);
  try {
    if (appUrl) allowed.add(new URL(appUrl).host);
  } catch {
    /* ignore */
  }
  if (!allowed.has(originHost)) throw forbidden("Yêu cầu từ nguồn không được phép.");
}
