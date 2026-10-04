"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, FileVideo, Folder, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Badge, Card } from "@/components/ui/misc";
import { Input, Label, Select } from "@/components/ui/input";
import { formatBytes, formatDateTime } from "@/lib/utils/format";

interface Item {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
}
interface MovieOption {
  id: string;
  title: string;
  type: "movie" | "series";
}
interface SyncReportView {
  newFiles: { id: string; name: string; size: number | null }[];
  linked: { episodeId: string; fileId: string; name: string }[];
  missing: { episodeId: string; fileId: string; name: string | null }[];
}

export function DriveBrowser({ movies, initialMovieId }: { movies: MovieOption[]; initialMovieId?: string }) {
  const [trail, setTrail] = useState<{ id?: string; name: string }[]>([{ name: "PHIM_WEB" }]);
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<Item | null>(null);
  const [form, setForm] = useState({ movieId: initialMovieId ?? "", season: 1, episode: 1, title: "" });
  const [linkMsg, setLinkMsg] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState<SyncReportView | null>(null);
  const [syncing, setSyncing] = useState(false);

  const folderId = trail[trail.length - 1].id;

  const load = useCallback(async (id: string | undefined, pageToken?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (id) qs.set("folderId", id);
      if (pageToken) qs.set("pageToken", pageToken);
      const res = await fetch(`/api/admin/drive/files?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems((prev) => (pageToken ? [...prev, ...data.items] : data.items));
      setNext(data.nextPageToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được Google Drive.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(folderId);
  }, [folderId, load]);

  const movie = movies.find((m) => m.id === form.movieId);

  async function link() {
    if (!linking) return;
    setBusy(true);
    setLinkMsg(null);
    try {
      const res = await fetch("/api/admin/drive/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: linking.id, movieId: form.movieId, season: form.season, episode: form.episode, title: form.title || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLinking(null);
      setLinkMsg(
        data.warnings?.length
          ? { tone: "warning", text: `Đã thêm vào thư viện. Cảnh báo: ${data.warnings.join(" ")}` }
          : { tone: "success", text: "Đã thêm vào thư viện." },
      );
    } catch (e) {
      setLinkMsg({ tone: "error", text: e instanceof Error ? e.message : "Không thêm được file." });
    } finally {
      setBusy(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    setSync(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/drive/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSync(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đồng bộ thất bại.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Đường dẫn" className="flex flex-wrap items-center text-sm">
          {trail.map((t, i) => (
            <span key={`${t.id ?? "root"}-${i}`} className="flex items-center">
              {i > 0 && <ChevronRight className="mx-1 h-4 w-4 text-muted-foreground" />}
              <button className="hover:underline" onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button>
            </span>
          ))}
        </nav>
        <Button variant="outline" onClick={runSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Đồng bộ với DB
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {linkMsg && <Alert tone={linkMsg.tone}>{linkMsg.text}</Alert>}

      {sync && (
        <Card className="space-y-2 text-sm">
          <div className="flex gap-2">
            <Badge tone="warning">File mới: {sync.newFiles.length}</Badge>
            <Badge tone="success">Đã liên kết: {sync.linked.length}</Badge>
            <Badge tone="danger">Thiếu: {sync.missing.length}</Badge>
          </div>
          {sync.newFiles.length > 0 && (
            <details><summary className="cursor-pointer">File mới trên Drive</summary>
              <ul className="mt-1 list-disc pl-5">{sync.newFiles.map((f) => <li key={f.id}>{f.name} <span className="text-muted-foreground">({formatBytes(f.size)})</span></li>)}</ul>
            </details>
          )}
          {sync.missing.length > 0 && (
            <details open><summary className="cursor-pointer">Tập có file bị thiếu (đã đặt trạng thái “missing”, không tự xóa)</summary>
              <ul className="mt-1 list-disc pl-5">{sync.missing.map((f) => <li key={f.episodeId}>{f.name ?? f.fileId}</li>)}</ul>
            </details>
          )}
        </Card>
      )}

      <div className="divide-y divide-border rounded-lg border border-border">
        {loading && items.length === 0 && <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải…</div>}
        {!loading && items.length === 0 && !error && <div className="p-4 text-sm text-muted-foreground">Thư mục trống (chỉ hiện folder và video).</div>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 p-3 text-sm">
            {it.isFolder ? <Folder className="h-5 w-5 shrink-0 text-primary" /> : <FileVideo className="h-5 w-5 shrink-0 text-muted-foreground" />}
            {it.isFolder ? (
              <button className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => setTrail([...trail, { id: it.id, name: it.name }])}>{it.name}</button>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                <span className="hidden text-muted-foreground sm:inline">{it.mimeType.replace("video/", "")}</span>
                <span className="w-20 text-right text-muted-foreground">{formatBytes(it.size)}</span>
                <span className="hidden w-32 text-right text-muted-foreground md:inline">{formatDateTime(it.modifiedTime)}</span>
                <Button size="sm" onClick={() => { setLinking(it); setLinkMsg(null); }}>Thêm vào thư viện</Button>
              </>
            )}
          </div>
        ))}
      </div>
      {next && <Button variant="outline" onClick={() => load(folderId, next)} disabled={loading}>Tải thêm</Button>}

      <Dialog open={!!linking} onClose={() => setLinking(null)} title="Thêm vào thư viện">
        <div className="space-y-3">
          <p className="truncate text-sm text-muted-foreground">{linking?.name}</p>
          <div>
            <Label htmlFor="link-movie">Phim</Label>
            <Select id="link-movie" value={form.movieId} onChange={(e) => setForm({ ...form, movieId: e.target.value })}>
              <option value="">— Chọn phim —</option>
              {movies.map((m) => <option key={m.id} value={m.id}>{m.title} ({m.type === "series" ? "bộ" : "lẻ"})</option>)}
            </Select>
          </div>
          {movie?.type === "series" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="link-season">Mùa</Label><Input id="link-season" type="number" min={0} value={form.season} onChange={(e) => setForm({ ...form, season: Number(e.target.value) })} /></div>
              <div><Label htmlFor="link-ep">Tập</Label><Input id="link-ep" type="number" min={0} value={form.episode} onChange={(e) => setForm({ ...form, episode: Number(e.target.value) })} /></div>
            </div>
          )}
          <div><Label htmlFor="link-title">Tiêu đề tập (tùy chọn)</Label><Input id="link-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          {linkMsg?.tone === "error" && <Alert tone="error">{linkMsg.text}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLinking(null)}>Hủy</Button>
            <Button onClick={link} disabled={busy || !form.movieId}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Thêm</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
