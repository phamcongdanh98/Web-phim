import type { fingerprint } from "./protocol";

/**
 * Resume info kept in localStorage. Deliberately contains NO OAuth tokens: only the session URL
 * (a one-file write capability), file identity, confirmed offset and the target episode.
 */
export interface StoredUpload {
  uploadUrl: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  offset: number;
  movieId: string;
  season: number;
  episode: number;
  title: string | null;
  savedAt: number;
}

const KEY = "phimweb.uploads.v1";
const MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000; // Google sessions last ~7 days

type Fp = ReturnType<typeof fingerprint>;

function readAll(): Record<Fp, StoredUpload> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<Fp, StoredUpload>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => now - v.savedAt < MAX_AGE_MS));
  } catch {
    return {};
  }
}

function writeAll(data: Record<Fp, StoredUpload>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode / quota): resume simply won't survive a reload */
  }
}

export const loadUpload = (fp: Fp): StoredUpload | null => readAll()[fp] ?? null;

export function saveUpload(fp: Fp, value: Omit<StoredUpload, "savedAt">) {
  writeAll({ ...readAll(), [fp]: { ...value, savedAt: Date.now() } });
}

export function clearUpload(fp: Fp) {
  const all = readAll();
  delete all[fp];
  writeAll(all);
}
