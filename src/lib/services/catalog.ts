import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "@/lib/http/errors";
import { sanitizeSearch } from "@/lib/validation/common";
import type { Episode, Genre, Movie, Subtitle, WatchProgress } from "@/types/db";

export const CARD_COLS = "id,slug,title,poster_url,backdrop_url,release_year,type,description,featured,runtime_minutes,age_rating,created_at";
export type MovieCardData = Pick<
  Movie,
  "id" | "slug" | "title" | "poster_url" | "backdrop_url" | "release_year" | "type" | "description" | "featured" | "runtime_minutes" | "age_rating" | "created_at"
>;

export interface ContinueItem {
  episodeId: string;
  movie: MovieCardData;
  label: string | null;
  percentage: number;
  positionSeconds: number;
}

export interface HomeData {
  hero: MovieCardData | null;
  continueWatching: ContinueItem[];
  latest: MovieCardData[];
  featured: MovieCardData[];
  movies: MovieCardData[];
  series: MovieCardData[];
  byGenre: { genre: Genre; movies: MovieCardData[] }[];
  favoriteIds: string[];
}

const ROW = 18;

export async function getContinueWatching(supabase: SupabaseClient, limit = 20): Promise<ContinueItem[]> {
  const { data } = await supabase
    .from("watch_progress")
    .select(
      `position_seconds,percentage,last_watched_at,episode_id,
       episodes!inner(season_number,episode_number,title,published,movies!inner(${CARD_COLS}))`,
    )
    .eq("completed", false)
    .gt("position_seconds", 10)
    .order("last_watched_at", { ascending: false })
    .limit(limit * 2);

  type Row = {
    position_seconds: number;
    percentage: number;
    episode_id: string;
    episodes: { season_number: number; episode_number: number; title: string | null; movies: MovieCardData };
  };
  const seen = new Set<string>();
  const out: ContinueItem[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    const movie = r.episodes.movies;
    if (seen.has(movie.id)) continue; // one card per movie, most recent episode
    seen.add(movie.id);
    out.push({
      episodeId: r.episode_id,
      movie,
      label: movie.type === "series" ? `S${r.episodes.season_number} · T${r.episodes.episode_number}` : null,
      percentage: Number(r.percentage),
      positionSeconds: r.position_seconds,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function getHomeData(supabase: SupabaseClient, userId: string): Promise<HomeData> {
  const published = () => supabase.from("movies").select(CARD_COLS).eq("published", true);
  const [latest, featured, movies, series, genres, links, continueWatching, favs] = await Promise.all([
    published().order("created_at", { ascending: false }).limit(ROW),
    published().eq("featured", true).order("created_at", { ascending: false }).limit(ROW),
    published().eq("type", "movie").order("created_at", { ascending: false }).limit(ROW),
    published().eq("type", "series").order("created_at", { ascending: false }).limit(ROW),
    supabase.from("genres").select("*").order("name"),
    // One query for all genre rows (no N+1); RLS already limits to published movies.
    supabase.from("movie_genres").select(`genre_id,movies!inner(${CARD_COLS})`).limit(1000),
    getContinueWatching(supabase),
    supabase.from("favorites").select("movie_id").eq("user_id", userId),
  ]);

  const grouped = new Map<string, MovieCardData[]>();
  for (const l of (links.data ?? []) as unknown as { genre_id: string; movies: MovieCardData }[]) {
    if (!grouped.has(l.genre_id)) grouped.set(l.genre_id, []);
    grouped.get(l.genre_id)!.push(l.movies);
  }
  const byGenre = ((genres.data ?? []) as Genre[])
    .map((genre) => ({
      genre,
      movies: (grouped.get(genre.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, ROW),
    }))
    .filter((g) => g.movies.length > 0);

  const featuredList = (featured.data ?? []) as MovieCardData[];
  const latestList = (latest.data ?? []) as MovieCardData[];
  return {
    hero: featuredList.find((m) => m.backdrop_url) ?? featuredList[0] ?? latestList.find((m) => m.backdrop_url) ?? latestList[0] ?? null,
    continueWatching,
    latest: latestList,
    featured: featuredList,
    movies: (movies.data ?? []) as MovieCardData[],
    series: (series.data ?? []) as MovieCardData[],
    byGenre,
    favoriteIds: (favs.data ?? []).map((f) => f.movie_id as string),
  };
}

export async function listByType(supabase: SupabaseClient, type: "movie" | "series") {
  const { data } = await supabase.from("movies").select(CARD_COLS).eq("published", true).eq("type", type).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as MovieCardData[];
}

export async function listByGenre(supabase: SupabaseClient, slug: string) {
  const { data: genre } = await supabase.from("genres").select("*").eq("slug", slug).maybeSingle();
  if (!genre) throw notFound("Không tìm thấy thể loại.");
  const { data } = await supabase.from("movie_genres").select(`movies!inner(${CARD_COLS})`).eq("genre_id", genre.id).limit(200);
  const movies = ((data ?? []) as unknown as { movies: MovieCardData }[]).map((r) => r.movies);
  return { genre: genre as Genre, movies: movies.sort((a, b) => b.created_at.localeCompare(a.created_at)) };
}

export async function searchMovies(supabase: SupabaseClient, rawQuery: string): Promise<MovieCardData[]> {
  const q = sanitizeSearch(rawQuery);
  if (q.length < 1) return [];
  const { data } = await supabase
    .from("movies")
    .select(CARD_COLS)
    .eq("published", true)
    .or(`title.ilike.%${q}%,original_title.ilike.%${q}%,description.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []) as MovieCardData[];
}

export async function getFavorites(supabase: SupabaseClient, userId: string): Promise<MovieCardData[]> {
  const { data } = await supabase
    .from("favorites")
    .select(`created_at,movies!inner(${CARD_COLS})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as { movies: MovieCardData }[]).map((r) => r.movies);
}

export interface MovieDetail {
  movie: Movie;
  genres: Genre[];
  episodes: Episode[];
  progress: Record<string, WatchProgress>;
  isFavorite: boolean;
  /** Episode the "Xem / Tiếp tục" button should open. */
  playEpisodeId: string | null;
  hasProgress: boolean;
}

export async function getMovieDetail(supabase: SupabaseClient, userId: string, slug: string): Promise<MovieDetail> {
  const { data: movie } = await supabase.from("movies").select("*, movie_genres(genres(*))").eq("slug", slug).eq("published", true).maybeSingle();
  if (!movie) throw notFound("Không tìm thấy phim.");
  const { movie_genres, ...m } = movie as Movie & { movie_genres: { genres: Genre }[] };

  const { data: eps } = await supabase
    .from("episodes")
    .select("*")
    .eq("movie_id", m.id)
    .eq("published", true)
    .order("season_number")
    .order("episode_number");
  const episodes = (eps ?? []) as Episode[];
  const ids = episodes.map((e) => e.id);

  const [{ data: prog }, { data: fav }] = await Promise.all([
    ids.length
      ? supabase.from("watch_progress").select("*").eq("user_id", userId).in("episode_id", ids)
      : Promise.resolve({ data: [] as WatchProgress[] }),
    supabase.from("favorites").select("movie_id").eq("user_id", userId).eq("movie_id", m.id).maybeSingle(),
  ]);
  const progress = Object.fromEntries(((prog ?? []) as WatchProgress[]).map((p) => [p.episode_id, p]));

  const latestIncomplete = Object.values(progress)
    .filter((p) => !p.completed && p.position_seconds > 10)
    .sort((a, b) => b.last_watched_at.localeCompare(a.last_watched_at))[0];

  return {
    movie: m as Movie,
    genres: movie_genres.map((g) => g.genres),
    episodes,
    progress,
    isFavorite: !!fav,
    playEpisodeId: latestIncomplete?.episode_id ?? episodes[0]?.id ?? null,
    hasProgress: !!latestIncomplete,
  };
}

export interface WatchData {
  episode: Episode;
  movie: Pick<Movie, "id" | "slug" | "title" | "type">;
  subtitles: Subtitle[];
  startAt: number;
  next: { id: string; label: string } | null;
}

export async function getWatchData(supabase: SupabaseClient, userId: string, episodeId: string): Promise<WatchData> {
  const { data: ep } = await supabase
    .from("episodes")
    .select("*, movies!inner(id,slug,title,type,published)")
    .eq("id", episodeId)
    .maybeSingle();
  if (!ep) throw notFound("Không tìm thấy tập phim.");
  const { movies, ...episode } = ep as Episode & { movies: Pick<Movie, "id" | "slug" | "title" | "type"> };

  const [{ data: subs }, { data: prog }, { data: siblings }] = await Promise.all([
    supabase.from("subtitles").select("*").eq("episode_id", episodeId).order("is_default", { ascending: false }),
    supabase.from("watch_progress").select("*").eq("user_id", userId).eq("episode_id", episodeId).maybeSingle(),
    supabase
      .from("episodes")
      .select("id,season_number,episode_number,title")
      .eq("movie_id", movies.id)
      .eq("published", true)
      .order("season_number")
      .order("episode_number"),
  ]);

  const list = (siblings ?? []) as Pick<Episode, "id" | "season_number" | "episode_number" | "title">[];
  const idx = list.findIndex((e) => e.id === episodeId);
  const nextEp = idx >= 0 ? list[idx + 1] : undefined;
  const p = prog as WatchProgress | null;
  return {
    episode: episode as Episode,
    movie: movies,
    subtitles: (subs ?? []) as Subtitle[],
    startAt: p && !p.completed && p.position_seconds > 10 ? p.position_seconds : 0,
    next: nextEp ? { id: nextEp.id, label: `S${nextEp.season_number} · T${nextEp.episode_number}${nextEp.title ? ` — ${nextEp.title}` : ""}` } : null,
  };
}
