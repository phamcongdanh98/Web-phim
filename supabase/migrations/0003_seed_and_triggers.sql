-- Seed genres (display names are Vietnamese; slugs stay English).
insert into public.genres (name, slug) values
  ('Hành động', 'action'),
  ('Phiêu lưu', 'adventure'),
  ('Hoạt hình', 'animation'),
  ('Hài', 'comedy'),
  ('Hình sự', 'crime'),
  ('Tài liệu', 'documentary'),
  ('Chính kịch', 'drama'),
  ('Gia đình', 'family'),
  ('Giả tưởng', 'fantasy'),
  ('Kinh dị', 'horror'),
  ('Bí ẩn', 'mystery'),
  ('Lãng mạn', 'romance'),
  ('Khoa học viễn tưởng', 'sci-fi'),
  ('Giật gân', 'thriller')
on conflict (slug) do nothing;

-- Safety net: every auth user gets a profile (public signup should be disabled anyway).
-- New profiles are inactive until an admin explicitly activates them.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name, role, is_active)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)), 'user', false)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
