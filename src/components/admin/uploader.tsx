"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, ProgressBar } from "@/components/ui/misc";
import { Input, Label, Select } from "@/components/ui/input";
import { fingerprint } from "@/lib/upload/protocol";
import { ResumableUploader, UploadAbortedError, UploadFatalError, xhrTransport } from "@/lib/upload/resumable";
import { clearUpload, loadUpload, saveUpload } from "@/lib/upload/storage";
import { formatBytes, formatDuration } from "@/lib/utils/format";

interface MovieOption {
  id: string;
  title: string;
  type: "movie" | "series";
}

type Phase = "idle" | "preparing" | "uploading" | "retrying" | "verifying" | "done" | "error" | "cancelled";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  preparing: "Đang chuẩn bị phiên tải lên…",
  uploading: "Đang tải lên",
  retrying: "Mất kết nối, đang thử lại…",
  verifying: "Đang xác minh file trên Drive…",
  done: "Hoàn tất",
  error: "Lỗi",
  cancelled: "Đã hủy",
};

export function Uploader({ movies, initialMovieId }: { movies: MovieOption[]; initialMovieId?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ movieId: initialMovieId ?? "", season: 1, episode: 1, title: "" });
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploaded, setUploaded] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [resumable, setResumable] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const uploaderRef = useRef<ResumableUploader | null>(null);
  const samples = useRef<{ t: number; b: number }[]>([]);
  const userCancelled = useRef(false);

  const movie = movies.find((m) => m.id === form.movieId);
  const busy = phase === "preparing" || phase === "uploading" || phase === "retrying" || phase === "verifying";
  const pct = file ? (uploaded / file.size) * 100 : 0;

  // Warn before leaving mid-upload; abort the request on unmount (state stays in localStorage for resume).
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  useEffect(() => () => abort.current?.abort(), []);

  function pickFile(f: File | null) {
    setFile(f);
    setPhase("idle");
    setMessage(null);
    setUploaded(0);
    const stored = f ? loadUpload(fingerprint(f)) : null;
    setResumable(stored ? stored.offset : null);
    if (stored) setForm((s) => ({ ...s, movieId: stored.movieId, season: stored.season, episode: stored.episode, title: stored.title ?? "" }));
  }

  function track(bytes: number) {
    const now = Date.now();
    const s = samples.current;
    s.push({ t: now, b: bytes });
    while (s.length > 2 && now - s[0].t > 8000) s.shift();
    if (s.length >= 2) setSpeed(((s[s.length - 1].b - s[0].b) / (s[s.length - 1].t - s[0].t)) * 1000);
    setUploaded(bytes);
  }

  async function newSession(f: File) {
    const res = await fetch("/api/admin/drive/upload-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: f.name, mimeType: f.type || "video/mp4", size: f.size, movieId: form.movieId, season: form.season, episode: form.episode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new UploadFatalError(data.error ?? "Không tạo được phiên tải lên.");
    return data as { uploadUrl: string; chunkSize: number };
  }

  async function start() {
    if (!file || !form.movieId) return;
    userCancelled.current = false;
    setMessage(null);
    setPhase("preparing");
    samples.current = [];
    const ac = new AbortController();
    abort.current = ac;
    const fp = fingerprint(file);
    const target = { movieId: form.movieId, season: form.season, episode: form.episode, title: form.title || null };

    try {
      let uploadUrl: string;
      let chunkSize = 16 * 1024 * 1024;
      let offset = 0;
      const stored = loadUpload(fp);
      let resumedFile: { id: string } | null = null;

      if (stored && stored.movieId === target.movieId) {
        uploadUrl = stored.uploadUrl;
        const probe = new ResumableUploader(file, uploadUrl, { transport: xhrTransport, signal: ac.signal });
        try {
          const st = await probe.queryStatus();
          if (st.done) resumedFile = st.file;
          else offset = st.offset;
        } catch (e) {
          if (e instanceof UploadFatalError && e.sessionExpired) {
            clearUpload(fp);
            ({ uploadUrl, chunkSize } = await newSession(file));
            offset = 0;
          } else throw e;
        }
      } else {
        ({ uploadUrl, chunkSize } = await newSession(file));
      }

      saveUpload(fp, { uploadUrl, fileName: file.name, fileSize: file.size, lastModified: file.lastModified, offset, ...target });

      let fileInfo = resumedFile;
      if (!fileInfo) {
        setPhase("uploading");
        const uploader = new ResumableUploader(file, uploadUrl, {
          chunkSize,
          transport: xhrTransport,
          signal: ac.signal,
          onProgress: (b) => {
            setPhase((p) => (p === "retrying" ? "uploading" : p));
            track(b);
          },
          onOffset: (o) => saveUpload(fp, { uploadUrl, fileName: file.name, fileSize: file.size, lastModified: file.lastModified, offset: o, ...target }),
          onRetry: (n, why) => {
            setPhase("retrying");
            setMessage(`Lần thử ${n}: ${why}`);
          },
        });
        uploaderRef.current = uploader;
        fileInfo = await uploader.upload(offset);
      }

      setPhase("verifying");
      const res = await fetch("/api/admin/drive/upload-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: fileInfo.id, expectedSize: file.size, ...target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new UploadFatalError(`${data.error ?? "Không xác minh được file."} File đã nằm trên Drive nhưng chưa được thêm vào thư viện.`);
      clearUpload(fp);
      setUploaded(file.size);
      setMessage(data.warnings?.length ? `Cảnh báo: ${data.warnings.join(" ")}` : null);
      setPhase("done");
    } catch (e) {
      if (e instanceof UploadAbortedError || ac.signal.aborted) {
        setPhase("cancelled");
        return;
      }
      if (e instanceof UploadFatalError && e.sessionExpired) clearUpload(fp);
      setMessage(e instanceof Error ? e.message : "Tải lên thất bại.");
      setPhase("error");
    }
  }

  async function cancel() {
    userCancelled.current = true;
    abort.current?.abort();
    if (file) {
      await uploaderRef.current?.cancelSession();
      clearUpload(fingerprint(file));
      setResumable(null);
    }
  }

  const eta = speed > 0 && file ? (file.size - uploaded) / speed : null;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Label htmlFor="up-movie">Phim</Label>
        <Select id="up-movie" value={form.movieId} disabled={busy} onChange={(e) => setForm({ ...form, movieId: e.target.value })}>
          <option value="">— Chọn phim —</option>
          {movies.map((m) => <option key={m.id} value={m.id}>{m.title} ({m.type === "series" ? "bộ" : "lẻ"})</option>)}
        </Select>
      </div>
      {movie?.type === "series" && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="up-season">Mùa</Label><Input id="up-season" type="number" min={0} disabled={busy} value={form.season} onChange={(e) => setForm({ ...form, season: Number(e.target.value) })} /></div>
          <div><Label htmlFor="up-ep">Tập</Label><Input id="up-ep" type="number" min={0} disabled={busy} value={form.episode} onChange={(e) => setForm({ ...form, episode: Number(e.target.value) })} /></div>
        </div>
      )}
      <div><Label htmlFor="up-title">Tiêu đề tập (tùy chọn)</Label><Input id="up-title" disabled={busy} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground hover:bg-muted">
        <UploadCloud className="h-8 w-8" />
        {file ? <span className="font-medium text-foreground">{file.name} · {formatBytes(file.size)}</span> : "Chọn file video (MP4 H.264 + AAC khuyến nghị)"}
        <input type="file" accept="video/*,.mkv" className="sr-only" disabled={busy} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
      </label>

      {file && resumable !== null && resumable > 0 && phase === "idle" && (
        <Alert tone="info">Tìm thấy phiên tải lên dở dang ({Math.round((resumable / file.size) * 100)}%). Bấm “Bắt đầu” để tiếp tục từ vị trí đó.</Alert>
      )}

      {file && phase !== "idle" && (
        <div className="space-y-2 rounded-lg border border-border p-3" aria-live="polite">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {phase === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              {PHASE_LABEL[phase]}
            </span>
            <span className="tabular-nums">{pct.toFixed(1)}%</span>
          </div>
          <ProgressBar value={pct} className="h-2" />
          <div className="flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground tabular-nums">
            <span>{formatBytes(uploaded)} / {formatBytes(file.size)}</span>
            {speed > 0 && phase === "uploading" && <span>{formatBytes(speed)}/s{eta !== null && ` · còn ${formatDuration(eta)}`}</span>}
          </div>
        </div>
      )}
      {message && <Alert tone={phase === "error" ? "error" : phase === "done" ? "warning" : "info"}>{message}</Alert>}

      <div className="flex gap-2">
        <Button onClick={start} disabled={!file || !form.movieId || busy}>{phase === "error" || phase === "cancelled" ? "Thử lại / tiếp tục" : "Bắt đầu"}</Button>
        {busy && <Button variant="outline" onClick={cancel}><X className="h-4 w-4" /> Hủy</Button>}
      </div>
    </div>
  );
}
