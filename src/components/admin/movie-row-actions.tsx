"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ListVideo, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/misc";

export function MovieRowActions({ id, title, published }: { id: string; title: string; published: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [deleteDrive, setDeleteDrive] = useState(false);
  const [confirmDrive, setConfirmDrive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePublish() {
    setBusy(true);
    await fetch(`/api/admin/movies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !published }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/movies/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteDriveFiles: deleteDrive, confirmDriveDelete: confirmDrive }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Xóa thất bại.");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="ghost" size="icon" title="Sửa">
        <Link href={`/admin/movies/${id}`}><Pencil className="h-4 w-4" /></Link>
      </Button>
      <Button asChild variant="ghost" size="icon" title="Các tập">
        <Link href={`/admin/movies/${id}/episodes`}><ListVideo className="h-4 w-4" /></Link>
      </Button>
      <Button variant="ghost" size="icon" title={published ? "Ẩn (unpublish)" : "Công khai (publish)"} onClick={togglePublish} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="icon" title="Xóa" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Xóa “${title}”?`}>
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" name="mode" checked={!deleteDrive} onChange={() => { setDeleteDrive(false); setConfirmDrive(false); }} className="mt-1" />
            <span><b>Chỉ xóa khỏi thư viện</b> (mặc định). File trên Google Drive được giữ nguyên.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="mode" checked={deleteDrive} onChange={() => setDeleteDrive(true)} className="mt-1" />
            <span><b>Xóa cả file trên Drive</b>. File được chuyển vào thùng rác Drive.</span>
          </label>
          {deleteDrive && (
            <Alert tone="warning">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={confirmDrive} onChange={(e) => setConfirmDrive(e.target.checked)} className="mt-1" />
                Tôi hiểu: các file video của phim này trên Drive sẽ bị xóa.
              </label>
            </Alert>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
            <Button variant="destructive" onClick={remove} disabled={busy || (deleteDrive && !confirmDrive)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xóa
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
