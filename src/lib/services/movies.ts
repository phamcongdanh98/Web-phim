import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils/format";
import { HttpError, notFound } from "@/lib/http/errors";
import { sanitizeSearch } from "@/lib/validation/common";
import type { MovieInput } from "@/lib/validation/movie";
import type { Episode, Genre, Movie } from "@/types/db";

export const PAGE_SIZE = 20;

export interface MovieListQuery {
  page: number;
  q?: string;
  type?: "movie" | "series";
  status?: "published" | "draft";
}

export async function listMoviesAdmin(supabase: SupabaseClient, query: MovieListQuery) {
  let qb = supabase.from("movies").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (query.type) qb = qb.eq("type", query.type);
  if (query.status) qb = qb.eq("published", query.status === "published");
  const q = query.q ? sanitizeSearch(query.q) : "";
  if (q) qb = qb.or(`title.ilike.%${q}%,original_title.ilike.%${q}%`);
  const from = (query.page - 1) * PAGE_SIZE;
  const { data, count, error } = await qb.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { movies: (data ?? []) as Movie[], total: count ?? 0 };
}

export async function getMovieWithGenreIds(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("movies").select("*, movie_genres(genre_id)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Không tìm thấy phim.");
  const { movie_genres, ...movie } = data as Movie & { movie_genres: { genre_id: string }[] };
  return { movie: movie as Movie, genreIds: movie_genres.map((g) => g.genre_id) };
}

export async function listGenres(supabase: SupabaseClient): Promise<Genre[]> {
  const { data } = await supabase.from("genres").select("*").order("name");
  return (data ?? []) as Genre[];
}

export async function listEpisodes(supabase: SupabaseClient, movieId: string): Promise<Episode[]> {
  const { data } = await supabase
    .from("episodes")
    .select("*")
    .eq("movie_id", movieId)
    .order("season_number")
    .order("episode_number");
  return (data ?? []) as Episode[];
}

async function uniqueSlug(supabase: SupabaseClient, title: string, ignoreId?: string): Promise<string> {
  const base = slugify(title) || "phim";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await supabase.from("movies").select("id").eq("slug", candidate).maybeSingle();
    if (!data || data.id === ignoreId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function setGenres(supabase: SupabaseClient, movieId: string, genreIds: string[]) {
  const del = await supabase.from("movie_genres").delete().eq("movie_id", movieId);
  if (del.error) throw new Error(del.error.message);
  if (genreIds.length === 0) return;
  const ins = await supabase.from("movie_genres").insert(genreIds.map((genre_id) => ({ movie_id: movieId, genre_id })));
  if (ins.error) throw new Error(ins.error.message);
}

export async function createMovie(supabase: SupabaseClient, userId: string, input: MovieInput): Promise<Movie> {
  const { genre_ids, ...fields } = input;
  const slug = await uniqueSlug(supabase, fields.title);
  const { data, error } = await supabase.from("movies").insert({ ...fields, slug, created_by: userId }).select("*").single();
  if (error) throw new Error(error.message);
  await setGenres(supabase, data.id, genre_ids);
  return data as Movie;
}

export async function updateMovie(supabase: SupabaseClient, id: string, input: Partial<MovieInput>): Promise<Movie> {
  const { genre_ids, ...fields } = input;
  const { data, error } = await supabase.from("movies").update(fields).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Không tìm thấy phim.");
  if (genre_ids) await setGenres(supabase, id, genre_ids);
  return data as Movie;
}

export function assertSeriesOrSingle(movie: Pick<Movie, "type">, existingEpisodeCount: number) {
  if (movie.type === "movie" && existingEpisodeCount >= 1) {
    throw new HttpError(409, "Phim lẻ chỉ có 1 tập.", { code: "SINGLE_EPISODE_ONLY" });
  }
}
