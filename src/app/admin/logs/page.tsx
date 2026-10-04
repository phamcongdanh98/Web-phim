import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Select } from "@/components/ui/input";
import { requirePageAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils/format";
import type { AuditLog } from "@/types/db";

export const metadata: Metadata = { title: "Nhật ký" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const ACTIONS = ["MOVIE_CREATE", "MOVIE_UPDATE", "MOVIE_DELETE", "DRIVE_UPLOAD", "DRIVE_SYNC", "DRIVE_LINK", "DRIVE_CONNECT", "DRIVE_DISCONNECT", "USER_CREATE", "USER_DISABLE", "USER_ENABLE", "ROLE_CHANGE", "PASSWORD_RESET"];

export default async function LogsPage({ searchParams }: PageProps<"/admin/logs">) {
  await requirePageAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const action = typeof sp.action === "string" && ACTIONS.includes(sp.action) ? sp.action : "";
  const admin = createSupabaseAdminClient();
  let q = admin.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (action) q = q.eq("action", action);
  const { data, count } = await q.range((page - 1) * PAGE, page * PAGE - 1);
  const logs = (data ?? []) as AuditLog[];
  const ids = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id,email").in("id", ids) : { data: [] };
  const email = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `/admin/logs?${new URLSearchParams({ ...(action ? { action } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nhật ký</h1>
      <form className="flex gap-2">
        <Select name="action" defaultValue={action} className="w-56"><option value="">Mọi hành động</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</Select>
        <Button type="submit" variant="secondary">Lọc</Button>
      </form>
      {logs.length === 0 ? <EmptyState>Chưa có nhật ký nào.</EmptyState> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground"><tr><th className="p-3">Thời gian</th><th className="p-3">Người thực hiện</th><th className="p-3">Hành động</th><th className="p-3">Chi tiết</th></tr></thead>
            <tbody className="divide-y divide-border">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap p-3 text-muted-foreground">{formatDateTime(l.created_at)}</td>
                  <td className="p-3">{(l.user_id && email.get(l.user_id)) || "—"}</td>
                  <td className="p-3"><Badge>{l.action}</Badge></td>
                  <td className="max-w-md truncate p-3 font-mono text-xs text-muted-foreground" title={JSON.stringify(l.metadata)}>{l.entity_type} {JSON.stringify(l.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Trang {page}/{pages}</span>
        <div className="flex gap-2">
          {page > 1 && <Button asChild variant="outline" size="sm"><Link href={href(page - 1)}>Trước</Link></Button>}
          {page < pages && <Button asChild variant="outline" size="sm"><Link href={href(page + 1)}>Sau</Link></Button>}
        </div>
      </div>
    </div>
  );
}
