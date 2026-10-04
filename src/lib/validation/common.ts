import { z } from "zod";
import { badRequest } from "@/lib/http/errors";

export const uuidSchema = z.string().uuid();

export function parseUuid(value: string): string {
  const r = uuidSchema.safeParse(value);
  if (!r.success) throw badRequest("ID không hợp lệ.");
  return r.data;
}

/** Escapes user text for use inside PostgREST `ilike`/`or` filters. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[%*,()\\]/g, " ").trim().slice(0, 100);
}

export function allowedImageHosts(): string[] {
  const hosts = ["image.tmdb.org"];
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) hosts.push(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host);
  } catch {
    /* ignore malformed env */
  }
  return hosts;
}

/** Poster/backdrop/subtitle URLs may only point at our Supabase Storage or TMDB's image CDN. */
export function isAllowedMediaUrl(value: string, hosts = allowedImageHosts()): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && hosts.includes(u.host);
  } catch {
    return false;
  }
}
