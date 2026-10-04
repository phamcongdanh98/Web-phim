"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Captions, Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Alert } from "@/components/ui/misc";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { formatBytes } from "@/lib/utils/format";
import { FASTSTART_FIX_COMMAND } from "@/lib/google-drive/formats";
import type { Episode, Subtitle } from "@/types/db";

type EpisodeWithSubs = Episode & { subtitles: Subtitle[] };

export function EpisodeManager({ movieId, isSeries, episodes }: { movieId: string; isSeries: boolean; episodes: EpisodeWithSubs[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string; title: string; season: number; episode: number } | null>(null);
  const [subFor, setSubFor] = useState<EpisodeWithSubs | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body?: object) {
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Thao tác thất bại.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function addSubtitle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!subFor) return;
    const res = await fetch(`/api/admin/episodes/${subFor.id}/subtitles`, { method: "POST", body: new FormData(e.currentTarget) });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Upload phụ đề thất bại.");
    setSubFor(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isSeries ? "Phim bộ: mỗi tập là một file video trên Drive." : "Phim lẻ: chỉ có 1 file video."}
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/upload?movieId=${movieId}`}>Tải lên file mới</Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/drive?movieId=${movieId}`}>Thêm file từ Google Drive</Link>
          </Button>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {episodes.map((ep) => (
        <div key={ep.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            {editing?.id === ep.id ? (
              <>
                {isSeries && (
                  <>
                    <Input className="w-16" type="number" value={editing.season} onChange={(e) => setEditing({ ...editing, season: Number(e.target.value) })} aria-label="Mùa" />
                    <Input className="w-16" type="number" value={editing.episode} onChange={(e) => setEditing({ ...editing, episode: Number(e.target.value) })} aria-label="Tập" />
                  </>
                )}
                <Input className="min-w-48 flex-1" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} aria-label="Tiêu đề" />
                <Button size="icon" variant="ghost" onClick={async () => (await call(`/api/admin/episodes/${ep.id}`, "PATCH", { title: editing.title, season_number: editing.season, episode_number: editing.episode })) && setEditing(null)}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className="font-medium">
                  {isSeries && `S${String(ep.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")} · `}
                  {ep.title || ep.storage_file_name || "Chưa đặt tên"}
                </span>
                <Badge tone={ep.published ? "success" : "warning"}>{ep.published ? "Hiển thị" : "Ẩn"}</Badge>
                {ep.file_status !== "ok" && <Badge tone="danger">{ep.file_status === "missing" ? "Thiếu file" : "Lỗi file"}</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">{formatBytes(ep.file_size)}</span>
                <Button size="icon" variant="ghost" title="Sửa" onClick={() => setEditing({ id: ep.id, title: ep.title ?? "", season: ep.season_number, episode: ep.episode_number })}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" title="Phụ đề" onClick={() => setSubFor(ep)}><Captions className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => call(`/api/admin/episodes/${ep.id}`, "PATCH", { published: !ep.published })}>{ep.published ? "Ẩn" : "Hiện"}</Button>
                <Button size="icon" variant="ghost" title="Gỡ khỏi thư viện" onClick={() => confirm("Gỡ tập này khỏi thư viện? File trên Drive được giữ nguyên.") && call(`/api/admin/episodes/${ep.id}`, "DELETE")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </>
            )}
          </div>
          {ep.faststart === false && (
            <Alert tone="warning" className="mt-2 flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                File này chưa “faststart” nên có thể khởi động/tua chậm. Chạy: <code className="rounded bg-black/30 px-1">{FASTSTART_FIX_COMMAND}</code> rồi tải lên lại.
              </span>
            </Alert>
          )}
          {ep.subtitles.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {ep.subtitles.map((s) => (
                <li key={s.id} className="flex items-center gap-1 rounded bg-muted px-2 py-1">
                  {s.label} ({s.language}){s.is_default && " ★"}
                  <button aria-label="Xóa phụ đề" onClick={() => call(`/api/admin/subtitles/${s.id}`, "DELETE")}><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {episodes.length === 0 && <Alert>Chưa có tập nào. Hãy thêm file từ Google Drive.</Alert>}

      <Dialog open={!!subFor} onClose={() => setSubFor(null)} title="Thêm phụ đề">
        <form onSubmit={addSubtitle} className="space-y-3">
          <div><Label htmlFor="sub-file">File (.vtt hoặc .srt)</Label><Input id="sub-file" name="file" type="file" accept=".vtt,.srt" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="sub-lang">Mã ngôn ngữ</Label><Input id="sub-lang" name="language" defaultValue="vi" required /></div>
            <div><Label htmlFor="sub-label">Nhãn</Label><Input id="sub-label" name="label" defaultValue="Tiếng Việt" required /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_default" value="true" /> Mặc định</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSubFor(null)}>Hủy</Button><Button type="submit">Tải lên</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
