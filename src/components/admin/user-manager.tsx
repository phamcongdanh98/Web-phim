"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Badge } from "@/components/ui/misc";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils/format";
import type { UserRow } from "@/lib/services/users";

export function UserManager({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  async function send(url: string, method: string, body: object, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.issues?.[0]?.message ?? data.error ?? "Thao tác thất bại.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await send("/api/admin/users", "POST", {
      email: f.get("email"), password: f.get("password"), display_name: f.get("display_name") || undefined, role: f.get("role"),
    }, "create");
    if (ok) setCreating(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setError(null); setCreating(true); }}><Plus className="h-4 w-4" /> Tạo tài khoản</Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr><th className="p-3">Người dùng</th><th className="p-3">Quyền</th><th className="p-3">Trạng thái</th><th className="p-3">Hoạt động gần nhất</th><th className="p-3 text-right">Hành động</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="p-3"><div className="font-medium">{u.display_name || "—"}</div><div className="text-xs text-muted-foreground">{u.email}</div></td>
                <td className="p-3">
                  <Select value={u.role} disabled={busy === `role-${u.id}`} className="h-8 w-28" aria-label={`Quyền của ${u.email}`}
                    onChange={(e) => send(`/api/admin/users/${u.id}`, "PATCH", { role: e.target.value }, `role-${u.id}`)}>
                    <option value="user">user</option><option value="admin">admin</option>
                  </Select>
                </td>
                <td className="p-3"><Badge tone={u.is_active ? "success" : "danger"}>{u.is_active ? "Hoạt động" : "Bị khóa"}</Badge></td>
                <td className="p-3 text-muted-foreground">{formatDateTime(u.last_active)}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" disabled={busy === `act-${u.id}`}
                      onClick={() => send(`/api/admin/users/${u.id}`, "PATCH", { is_active: !u.is_active }, `act-${u.id}`)}>
                      {busy === `act-${u.id}` && <Loader2 className="h-3 w-3 animate-spin" />}{u.is_active ? "Khóa" : "Mở khóa"}
                    </Button>
                    <Button size="icon" variant="ghost" title="Đặt lại mật khẩu" onClick={() => { setError(null); setNewPassword(""); setResetFor(u); }}><KeyRound className="h-4 w-4" /></Button>
                  </div>
                  {u.id === currentUserId && <p className="mt-1 text-right text-[11px] text-muted-foreground">Đây là bạn</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Tạo tài khoản">
        <form onSubmit={create} className="space-y-3">
          <div><Label htmlFor="u-email">Email</Label><Input id="u-email" name="email" type="email" required /></div>
          <div><Label htmlFor="u-name">Tên hiển thị</Label><Input id="u-name" name="display_name" /></div>
          <div><Label htmlFor="u-pass">Mật khẩu tạm (≥ 8 ký tự)</Label><Input id="u-pass" name="password" type="text" minLength={8} required autoComplete="off" /></div>
          <div><Label htmlFor="u-role">Quyền</Label><Select id="u-role" name="role" defaultValue="user"><option value="user">user</option><option value="admin">admin</option></Select></div>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Hủy</Button><Button type="submit" disabled={busy === "create"}>Tạo</Button></div>
        </form>
      </Dialog>

      <Dialog open={!!resetFor} onClose={() => setResetFor(null)} title={`Đặt lại mật khẩu: ${resetFor?.email ?? ""}`}>
        <div className="space-y-3">
          <div><Label htmlFor="r-pass">Mật khẩu mới (≥ 8 ký tự)</Label><Input id="r-pass" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="off" /></div>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResetFor(null)}>Hủy</Button>
            <Button disabled={newPassword.length < 8 || busy === `pw-${resetFor?.id}`}
              onClick={async () => resetFor && (await send(`/api/admin/users/${resetFor.id}`, "PATCH", { new_password: newPassword }, `pw-${resetFor.id}`)) && setResetFor(null)}>Đặt lại</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
