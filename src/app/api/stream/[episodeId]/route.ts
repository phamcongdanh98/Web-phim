import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/http/rate-limit";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getStorageProvider } from "@/lib/google-drive/provider";
import { StreamLimiter } from "@/lib/stream/limiter";
import { getStreamEpisode, markEpisodeMissing } from "@/lib/stream/episode-cache";
import { handleStream, type StreamDeps } from "@/lib/stream/handler";

// Node runtime only: Edge cannot do long-lived streaming proxying to Drive reliably.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Module-level singleton: counters live for the lifetime of this server process (single instance by design).
const limiter = new StreamLimiter(
  () => serverEnv().MAX_CONCURRENT_STREAMS,
  () => serverEnv().MAX_STREAMS_PER_USER,
);

const deps: StreamDeps = {
  async authenticate() {
    // Light path: JWT verified locally + 30s cached profile, so Range requests stay cheap.
    const ctx = await requireUser({ light: true });
    return { userId: ctx.userId, isAdmin: ctx.profile.role === "admin" };
  },
  getEpisode: getStreamEpisode,
  openDrive: ({ fileId, range, ifRange, signal }) => getStorageProvider().getStream(fileId, range, signal, ifRange),
  markMissing: markEpisodeMissing,
  limiter,
  // Seeking is bursty; this only stops runaway clients. Throws HttpError(429) which the handler maps.
  rateLimit: (userId) => rateLimit(`stream:${userId}`, 600, 60_000),
  log: (event, fields) => logger.warn(event, { route: "api/stream", ...fields }),
};

export async function GET(request: Request, ctx: RouteContext<"/api/stream/[episodeId]">) {
  return handleStream(request, (await ctx.params).episodeId, deps);
}

export async function HEAD(request: Request, ctx: RouteContext<"/api/stream/[episodeId]">) {
  return handleStream(request, (await ctx.params).episodeId, deps);
}
