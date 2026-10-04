import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public opts: { code?: string; retryAfter?: number; detail?: string } = {},
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "Bạn cần đăng nhập.", { code: "UNAUTHORIZED" });
export const forbidden = (msg = "Bạn không có quyền thực hiện thao tác này.") =>
  new HttpError(403, msg, { code: "FORBIDDEN" });
export const notFound = (msg = "Không tìm thấy.") => new HttpError(404, msg, { code: "NOT_FOUND" });
export const badRequest = (msg = "Dữ liệu không hợp lệ.") => new HttpError(400, msg, { code: "BAD_REQUEST" });

/** Single place that turns thrown errors into JSON responses. Never leaks stack traces. */
export function errorResponse(err: unknown, ctx: { route?: string; requestId?: string } = {}): NextResponse {
  if (err instanceof HttpError) {
    const headers: Record<string, string> = {};
    if (err.opts.retryAfter) headers["Retry-After"] = String(err.opts.retryAfter);
    return NextResponse.json({ error: err.message, code: err.opts.code }, { status: err.status, headers });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Dữ liệu không hợp lệ.", code: "VALIDATION", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  logger.error("unhandled_error", { ...ctx, message: err instanceof Error ? err.message : String(err) });
  return NextResponse.json({ error: "Đã có lỗi xảy ra. Vui lòng thử lại.", code: "INTERNAL" }, { status: 500 });
}

/** Parse + validate a JSON body with a Zod schema. */
export async function readJson<T>(request: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest("Body JSON không hợp lệ.");
  }
  return schema.parse(raw);
}
