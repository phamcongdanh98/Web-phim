import { describe, expect, it, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

// Runs the real migrations on an in-process Postgres with minimal Supabase stubs (auth/storage).
const U1 = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";
let db: PGlite;

async function as<T = Record<string, unknown>>(uid: string, sql: string) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub','${uid}',false);`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    create table storage.buckets(id text primary key, name text, public bool, file_size_limit int, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, auth to anon, authenticated;
  `);
  const dir = path.resolve(__dirname, "../supabase/migrations");
  for (const f of fs.readdirSync(dir).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  // Supabase's default privileges grant table access to API roles; RLS/column grants then narrow it.
  await db.exec(`
    grant select,insert,update,delete on all tables in schema public to authenticated;
    revoke all on public.drive_integrations from anon, authenticated;
    grant update (display_name, avatar_url) on public.profiles to authenticated;
    revoke update on public.profiles from authenticated; grant update (display_name, avatar_url) on public.profiles to authenticated;
    insert into auth.users(id,email) values ('${U1}','a@x.io'),('${ADMIN}','b@x.io');
    update public.profiles set is_active=true where id in ('${U1}','${ADMIN}');
    update public.profiles set role='admin' where id='${ADMIN}';
    insert into public.movies(title,slug,published) values ('Pub','pub',true),('Draft','draft',false);
  `);
});

describe("RLS", () => {
  it("users see only published movies, admins see all", async () => {
    expect((await as<{ slug: string }>(U1, "select slug from movies")).map((r) => r.slug)).toEqual(["pub"]);
    expect(await as(ADMIN, "select slug from movies")).toHaveLength(2);
  });
  it("users cannot escalate role or re-enable themselves", async () => {
    await expect(as(U1, `update profiles set role='admin' where id='${U1}'`)).rejects.toThrow();
    await expect(as(U1, `update profiles set is_active=false where id='${U1}'`)).rejects.toThrow();
  });
  it("users can change display_name", async () => {
    await as(U1, `update profiles set display_name='Z' where id='${U1}'`);
    expect((await as<{ display_name: string }>(U1, `select display_name from profiles where id='${U1}'`))[0].display_name).toBe("Z");
  });
  it("users only read their own profile", async () => {
    expect(await as(U1, "select id from profiles")).toHaveLength(1);
  });
  it("drive_integrations is not accessible to API roles", async () => {
    await expect(as(U1, "select * from drive_integrations")).rejects.toThrow();
  });
  it("seeds 14 genres", async () => {
    expect((await as<{ c: number }>(U1, "select count(*)::int c from genres"))[0].c).toBe(14);
  });
  it("watch_progress is private per user", async () => {
    const ep = (await db.query<{ id: string }>(
      `insert into episodes(movie_id,storage_file_id) select id,'f1' from movies where slug='pub' returning id`)).rows[0].id;
    await as(U1, `insert into watch_progress(user_id,episode_id) values ('${U1}','${ep}')`);
    expect(await as(ADMIN, "select * from watch_progress")).toHaveLength(0);
    await expect(as(ADMIN, `insert into watch_progress(user_id,episode_id) values ('${U1}','${ep}')`)).rejects.toThrow();
  });
});
