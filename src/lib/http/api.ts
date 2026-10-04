import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { logger } from "@/lib/logger";

/** Wraps a route handler: request id, structured log line, centralised error mapping. */
export function api<Args extends unknown[]>(
  route: string,
  handler: (request: Request, requestId: string, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const res = await handler(request, requestId, ...args);
      res.headers.set("X-Request-Id", requestId);
      return res;
    } catch (err) {
      const res = errorResponse(err, { route, requestId });
      res.headers.set("X-Request-Id", requestId);
      logger.warn("api_error", { route, requestId, status: res.status });
      return res;
    }
  };
}

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
