-- Phim Web: core schema. RLS lives in 0002.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('admin', 'user')),
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.drive_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google_drive' check (provider = 'google_drive'),
  google_account_email text,
  encrypted_refresh_token text not null,
  root_folder_id text not null,
  status text not null default 'connected' check (status in ('connected', 'disconnected')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Only one integration row per provider.
create unique index drive_integrations_provider_key on public.drive_integrations (provider);

create table public.genres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

create table public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  original_title text,
  description text,
  poster_url text,
  backdrop_url text,
  release_year int check (release_year between 1880 and 2100),
  type text not null default 'movie' check (type in ('movie', 'series')),
  runtime_minutes int check (runtime_minutes >= 0),
  age_rating text,
  country text,
  director text,
  tmdb_id int,
  featured boolean not null default false,
  published boolean not null default false,
  drive_folder_id text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.movie_genres (
  movie_id uuid not null references public.movies(id) on delete cascade,
  genre_id uuid not null references public.genres(id) on delete cascade,
  primary key (movie_id, genre_id)
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  season_number int not null default 1 check (season_number >= 0),
  episode_number int not null default 1 check (episode_number >= 0),
  title text,
  description text,
  storage_provider text not null default 'google_drive',
  storage_file_id text not null unique,
  storage_file_name text,
  mime_type text,
  file_size bigint,
  duration_seconds int,
  file_status text not null default 'ok' check (file_status in ('ok', 'missing', 'error')),
  faststart boolean,
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (movie_id, season_number, episode_number)
);

create table public.subtitles (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  language text not null,
  label text not null,
  url text not null,
  is_default boolean not null default false
);

create table public.watch_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  position_seconds int not null default 0,
  duration_seconds int not null default 0,
  percentage numeric(5,2) not null default 0,
  completed boolean not null default false,
  last_watched_at timestamptz not null default now(),
  unique (user_id, episode_id)
);

create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  movie_id uuid not null references public.movies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index movies_slug_idx on public.movies (slug);
create index movies_published_created_idx on public.movies (published, created_at desc);
create index movies_featured_idx on public.movies (featured) where featured;
create index episodes_movie_idx on public.episodes (movie_id);
create index episodes_storage_file_idx on public.episodes (storage_file_id);
create index subtitles_episode_idx on public.subtitles (episode_id);
create index movie_genres_genre_idx on public.movie_genres (genre_id);
create index watch_progress_user_idx on public.watch_progress (user_id, last_watched_at desc);
create index favorites_user_idx on public.favorites (user_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- updated_at maintenance
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger movies_updated before update on public.movies
  for each row execute function public.set_updated_at();
create trigger episodes_updated before update on public.episodes
  for each row execute function public.set_updated_at();
create trigger drive_integrations_updated before update on public.drive_integrations
  for each row execute function public.set_updated_at();
