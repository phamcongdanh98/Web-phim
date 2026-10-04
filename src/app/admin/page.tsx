import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, Card, Skeleton } from "@/components/ui/misc";
import { requirePageAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDriveStatus } from "@/lib/google-drive/status";
import { DISCONNECTED_MESSAGE } from "@/lib/google-drive/errors";
import { formatBytes, formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

async function Stats() {
  const admin = createSupabaseAdminClient();
  const [movies, episodes, sizes, users, recent, logs] = await Promise.all([
    admin.from("movies").select("id", { count: "exact", head: true }),
    admin.from("episodes").select("id", { count: "exact", head: true }),
    admin.from("episodes").select("file_size"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("watch_progress")
      .select("last_watched_at,percentage,profiles(display_name,email),episodes(season_number,episode_number,movies(title))")
      .order("last_watched_at", { ascending: false })
      .limit(8),
    admin.from("audit_logs").select("action,created_at,metadata").order("created_at", { ascending: false }).limit(8),
  ]);
  const totalBytes = (sizes.data ?? []).reduce((s, e) => s + Number(e.file_size ?? 0), 0);
  const tiles = [
    ["Tổng phim", movies.count ?? 0],
    ["Tổng tập", episodes.count ?? 0],
    ["Dung lượng", formatBytes(totalBytes)],
    ["Người dùng", users.count ?? 0],
  ];
  type Recent = { last_watched_at: string; percentage: number; profiles: { display_name: string | null; email: string } | null; episodes: { season_number: number; episode_number: number; movies: { title: string } | null } | null };
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <Card key={label as string}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium">Xem gần đây</h2>
          <ul className="space-y-2 text-sm">
            {((recent.data ?? []) as unknown as Recent[]).map((r, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{r.profiles?.display_name || r.profiles?.email} · {r.episodes?.movies?.title}</span>
                <span className="shrink-0 text-muted-foreground">{formatDateTime(r.last_watched_at)}</span>
              </li>
            ))}
            {(recent.data ?? []).length === 0 && <li className="text-muted-foreground">Chưa có hoạt động.</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-medium">Hoạt động quản trị</h2>
          <ul className="space-y-2 text-sm">
            {(logs.data ?? []).map((l, i) => (
              <li key={i} className="flex justify-between gap-2"><span>{l.action}</span><span className="text-muted-foreground">{formatDateTime(l.created_at)}</span></li>
            ))}
            {(logs.data ?? []).length === 0 && <li className="text-muted-foreground">Chưa có hoạt động.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

export default async function AdminDashboard() {
  await requirePageAdmin();
  const drive = await getDriveStatus();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {drive.state === "disconnected" && (
        <Alert tone="error">{DISCONNECTED_MESSAGE} <Link href="/admin/settings" className="underline">Kết nối lại</Link></Alert>
      )}
      {drive.state === "not_connected" && (
        <Alert tone="warning">Chưa kết nối Google Drive. <Link href="/admin/settings" className="underline">Vào Cài đặt</Link></Alert>
      )}
      <Suspense fallback={<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>}>
        <Stats />
      </Suspense>
    </div>
  );
}
