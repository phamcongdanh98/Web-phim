import "server-only";
import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http/errors";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

export function tmdbEnabled(): boolean {
  return !!process.env.TMDB_API_KEY;
}

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!tmdbEnabled()) throw new HttpError(404, "TMDB chưa được bật (thiếu TMDB_API_KEY).", { code: "TMDB_DISABLED" });
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("language", "vi-VN");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // v4 "read access token" (JWT) goes in a header; a v3 API key (32 hex) must be a query param.
  // Errors below never include the URL, so the key cannot leak into logs or responses.
  const key = serverEnv().TMDB_API_KEY!;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key.length > 40) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new HttpError(502, "TMDB không phản hồi.", { code: "TMDB_ERROR" });
  return res.json() as Promise<T>;
}

export interface TmdbSearchItem {
  tmdbId: number;
  type: "movie" | "series";
  title: string;
  year: number | null;
  posterUrl: string | null;
}

interface RawSearch {
  results: { id: number; media_type: string; title?: string; name?: string; release_date?: string; first_air_date?: string; poster_path?: string | null }[];
}

export async function searchTmdb(query: string): Promise<TmdbSearchItem[]> {
  const data = await tmdb<RawSearch>("/search/multi", { query, include_adult: "false" });
  return data.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 10)
    .map((r) => {
      const date = r.release_date ?? r.first_air_date;
      return {
        tmdbId: r.id,
        type: r.media_type === "tv" ? ("series" as const) : ("movie" as const),
        title: r.title ?? r.name ?? "",
        year: date ? Number(date.slice(0, 4)) || null : null,
        posterUrl: r.poster_path ? `${IMG}/w185${r.poster_path}` : null,
      };
    });
}

interface RawDetail {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: { name: string }[];
  production_countries?: { name: string }[];
  origin_country?: string[];
  credits?: { crew?: { job: string; name: string }[] };
}

/** TMDB English genre names → our seeded slugs. */
const GENRE_SLUG: Record<string, string> = {
  action: "action", adventure: "adventure", animation: "animation", comedy: "comedy", crime: "crime",
  documentary: "documentary", drama: "drama", family: "family", fantasy: "fantasy", horror: "horror",
  mystery: "mystery", romance: "romance", "science fiction": "sci-fi", thriller: "thriller",
  "action & adventure": "action", "sci-fi & fantasy": "sci-fi", "khoa học viễn tưởng": "sci-fi",
  "hành động": "action", "phiêu lưu": "adventure", "hoạt hình": "animation", "hài": "comedy", "hình sự": "crime",
  "tài liệu": "documentary", "chính kịch": "drama", "gia đình": "family", "giả tưởng": "fantasy", "kinh dị": "horror",
  "bí ẩn": "mystery", "lãng mạn": "romance", "phim gây cấn": "thriller", "giật gân": "thriller",
};

export async function getTmdbDetail(type: "movie" | "series", id: number) {
  const d = await tmdb<RawDetail>(`/${type === "series" ? "tv" : "movie"}/${id}`, { append_to_response: "credits" });
  const date = d.release_date ?? d.first_air_date;
  return {
    tmdb_id: id,
    type,
    title: d.title ?? d.name ?? "",
    original_title: d.original_title ?? d.original_name ?? null,
    description: d.overview || null,
    release_year: date ? Number(date.slice(0, 4)) || null : null,
    runtime_minutes: d.runtime ?? d.episode_run_time?.[0] ?? null,
    poster_url: d.poster_path ? `${IMG}/w780${d.poster_path}` : null,
    backdrop_url: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : null,
    director: d.credits?.crew?.find((c) => c.job === "Director")?.name ?? null,
    country: d.production_countries?.[0]?.name ?? d.origin_country?.[0] ?? null,
    genre_slugs: [...new Set((d.genres ?? []).map((g) => GENRE_SLUG[g.name.toLowerCase()]).filter(Boolean))],
  };
}
