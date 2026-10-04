-- Row Level Security. Service role bypasses RLS; everything here targets anon/authenticated.

-- SECURITY DEFINER + empty search_path avoids policy recursion on profiles.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active
  );
$$;

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_active_user() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;

alter table public.profiles enable row level security;
alter table public.drive_integrations enable row level security;
alter table public.genres enable row level security;
alter table public.movie_genres enable row level security;
alter table public.movies enable row level security;
alter table public.episodes enable row level security;
alter table public.subtitles enable row level security;
alter table public.watch_progress enable row level security;
alter table public.favorites enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: own row readable; admin all. Users may only change display_name/avatar_url.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Column-level guard: authenticated users can never touch role / is_active directly.
-- Admin changes go through the service role in server code, which also enforces "last admin".
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- Defense in depth: even if grants are loosened later, block self-escalation.
create function public.guard_profile_privileged_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Only API-facing roles are restricted; service_role / postgres (dashboard, migrations) pass.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.role is distinct from old.role or new.is_active is distinct from old.is_active
     or new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'Không được phép sửa role / is_active / email trực tiếp' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- drive_integrations: no policies => only service role can read/write.
revoke all on public.drive_integrations from anon, authenticated;

-- audit_logs: admin read only (writes via service role).
create policy audit_logs_admin_select on public.audit_logs for select to authenticated
  using (public.is_admin());

-- Catalogue: active users read published content, admins manage everything.
create policy genres_select on public.genres for select to authenticated using (public.is_active_user());
create policy genres_admin on public.genres for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy movies_select on public.movies for select to authenticated
  using ((published and public.is_active_user()) or public.is_admin());
create policy movies_admin on public.movies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy movie_genres_select on public.movie_genres for select to authenticated
  using (
    public.is_admin() or (
      public.is_active_user() and exists (
        select 1 from public.movies m where m.id = movie_id and m.published)
    )
  );
create policy movie_genres_admin on public.movie_genres for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy episodes_select on public.episodes for select to authenticated
  using (
    public.is_admin() or (
      published and public.is_active_user() and exists (
        select 1 from public.movies m where m.id = movie_id and m.published)
    )
  );
create policy episodes_admin on public.episodes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy subtitles_select on public.subtitles for select to authenticated
  using (
    public.is_admin() or (
      public.is_active_user() and exists (
        select 1 from public.episodes e join public.movies m on m.id = e.movie_id
        where e.id = episode_id and e.published and m.published)
    )
  );
create policy subtitles_admin on public.subtitles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Per-user data
create policy watch_progress_own on public.watch_progress for all to authenticated
  using (user_id = (select auth.uid()) and public.is_active_user())
  with check (user_id = (select auth.uid()) and public.is_active_user());

create policy favorites_own on public.favorites for all to authenticated
  using (user_id = (select auth.uid()) and public.is_active_user())
  with check (user_id = (select auth.uid()) and public.is_active_user());

-- Storage bucket for posters / backdrops / subtitles. Public read (artwork only, never video).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'text/vtt', 'text/plain'])
on conflict (id) do nothing;

create policy media_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());
