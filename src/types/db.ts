// Hand-written row types mirroring supabase/migrations. Keep in sync with the SQL.
export type Role = "admin" | "user";
export type MovieType = "movie" | "series";
export type FileStatus = "ok" | "missing" | "error";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: Role;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Genre {
  id: string;
  name: string;
  slug: string;
}

export interface Movie {
  id: string;
  title: string;
  slug: string;
  original_title: string | null;
  description: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  release_year: number | null;
  type: MovieType;
  runtime_minutes: number | null;
  age_rating: string | null;
  country: string | null;
  director: string | null;
  tmdb_id: number | null;
  featured: boolean;
  published: boolean;
  drive_folder_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Episode {
  id: string;
  movie_id: string;
  season_number: number;
  episode_number: number;
  title: string | null;
  description: string | null;
  storage_provider: string;
  storage_file_id: string;
  storage_file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  file_status: FileStatus;
  faststart: boolean | null;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subtitle {
  id: string;
  episode_id: string;
  language: string;
  label: string;
  url: string;
  is_default: boolean;
}

export interface WatchProgress {
  id: string;
  user_id: string;
  episode_id: string;
  position_seconds: number;
  duration_seconds: number;
  percentage: number;
  completed: boolean;
  last_watched_at: string;
}

export interface DriveIntegration {
  id: string;
  provider: "google_drive";
  google_account_email: string | null;
  encrypted_refresh_token: string;
  root_folder_id: string;
  status: "connected" | "disconnected";
  connected_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type MovieWithGenres = Movie & { genres: Genre[] };
