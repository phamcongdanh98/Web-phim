import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().min(1),
  TMDB_API_KEY: z.string().optional(),
  MAX_CONCURRENT_STREAMS: z.coerce.number().int().positive().default(15),
  MAX_STREAMS_PER_USER: z.coerce.number().int().positive().default(3),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** Parsed lazily so `next build` works without secrets; throws a clear message at first use. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse({
    ...process.env,
    TMDB_API_KEY: process.env.TMDB_API_KEY || undefined,
  });
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Thiếu hoặc sai biến môi trường: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}
