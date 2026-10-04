"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PictureInPicture2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { formatDuration } from "@/lib/utils/format";

interface SubtitleInfo {
  id: string;
  label: string;
  language: string;
  is_default: boolean;
}

export interface PlayerProps {
  episodeId: string;
  title: string;
  subtitle?: string | null;
  backHref: string;
  startAt: number;
  next: { id: string; label: string } | null;
  subtitles: SubtitleInfo[];
}

const SAVE_INTERVAL_MS = 12_000;
const NEXT_COUNTDOWN_S = 10;
const SEEK_STEP_S = 10;

export function Player({ episodeId, title, subtitle, backHref, startAt, next, subtitles }: PlayerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef(-1);
  // Never persist before the viewer chose to start/resume: otherwise "0:00" would overwrite saved progress.
  const canSave = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [askResume, setAskResume] = useState(startAt > 0);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pipOk, setPipOk] = useState(false);
  const src = `/api/stream/${episodeId}`;

  const save = useCallback(
    (mode: "fetch" | "beacon" = "fetch") => {
      const v = videoRef.current;
      if (!v || !canSave.current || !Number.isFinite(v.duration) || v.duration <= 0) return;
      const pos = Math.floor(v.currentTime);
      if (pos === lastSent.current) return;
      lastSent.current = pos;
      const body = JSON.stringify({ positionSeconds: v.currentTime, durationSeconds: v.duration });
      const url = `/api/progress/${episodeId}`;
      if (mode === "beacon" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        // keepalive lets the request outlive the page (tab close / navigation).
        fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
      }
    },
    [episodeId],
  );

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  // Save on tab hide / page leave / unmount.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && save("beacon");
    const onPageHide = () => save("beacon");
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      stopTimer();
      save("fetch");
    };
  }, [save]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPipOk(typeof document !== "undefined" && document.pictureInPictureEnabled === true);
  }, []);

  // Keyboard: Space, ←/→ (±10s), F, M.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input,textarea,select,[contenteditable='true']") || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case " ":
          if (t?.tagName === "BUTTON") return; // let focused buttons keep native Space behaviour
          e.preventDefault();
          if (v.paused) void v.play();
          else v.pause();
          break;
        case "ArrowRight":
          e.preventDefault();
          v.currentTime = Math.min(v.duration || Infinity, v.currentTime + SEEK_STEP_S);
          break;
        case "ArrowLeft":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - SEEK_STEP_S);
          break;
        case "f":
        case "F":
          e.preventDefault();
          if (document.fullscreenElement) void document.exitFullscreen();
          else void boxRef.current?.requestFullscreen?.();
          break;
        case "m":
        case "M":
          e.preventDefault();
          v.muted = !v.muted;
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Next-episode countdown.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (next) router.push(`/watch/${next.id}`);
      return;
    }
    const id = setTimeout(() => setCountdown((c) => (c === null ? c : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, next, router]);

  async function explainError() {
    // The <video> error event carries no HTTP detail; probe with a 1-byte range to get our JSON message.
    try {
      const res = await fetch(src, { headers: { Range: "bytes=0-0" } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return setError([data.error ?? "Không thể tải video.", data.detail].filter(Boolean).join(" — "));
      }
    } catch {
      /* fall through */
    }
    setError("Trình duyệt không phát được video này. Định dạng có thể không tương thích.");
  }

  function startAtSaved() {
    const v = videoRef.current;
    if (!v) return;
    setAskResume(false);
    const go = () => {
      v.currentTime = startAt;
      void v.play();
    };
    if (v.readyState >= 1) go();
    else v.addEventListener("loadedmetadata", go, { once: true });
  }

  function startOver() {
    setAskResume(false);
    void videoRef.current?.play();
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 p-0 sm:p-4">
      <div className="flex items-center gap-3 px-4 pt-3 sm:px-0 sm:pt-0">
        <Button asChild variant="ghost" size="icon" aria-label="Quay lại">
          <Link href={backHref}><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {pipOk && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label="Picture-in-Picture"
            onClick={() => {
              if (document.pictureInPictureElement) void document.exitPictureInPicture();
              else void videoRef.current?.requestPictureInPicture();
            }}
          >
            <PictureInPicture2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div ref={boxRef} className="relative aspect-video w-full overflow-hidden bg-black sm:rounded-lg">
        <video
          ref={videoRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full"
          data-testid="video"
          onPlay={() => {
            canSave.current = true;
            setCountdown(null);
            stopTimer();
            timer.current = setInterval(() => save("fetch"), SAVE_INTERVAL_MS);
          }}
          onPause={() => {
            stopTimer();
            save("fetch");
          }}
          onEnded={() => {
            stopTimer();
            save("fetch");
            if (next) setCountdown(NEXT_COUNTDOWN_S);
          }}
          onError={explainError}
        >
          {subtitles.map((s) => (
            <track key={s.id} kind="subtitles" src={`/api/subtitles/${s.id}`} srcLang={s.language} label={s.label} default={s.is_default} />
          ))}
        </video>

        {askResume && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-4 text-center">
            <p className="text-lg">Bạn đang xem dở phim này</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="lg" onClick={startAtSaved}>Tiếp tục từ {formatDuration(startAt)}</Button>
              <Button size="lg" variant="secondary" onClick={startOver}><RotateCcw className="h-4 w-4" /> Bắt đầu lại</Button>
            </div>
          </div>
        )}

        {countdown !== null && next && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center" data-testid="next-overlay">
            <p className="text-lg">Tập tiếp theo bắt đầu sau {countdown} giây</p>
            <p className="text-sm text-muted-foreground">{next.label}</p>
            <div className="flex gap-2">
              <Button size="lg" onClick={() => router.push(`/watch/${next.id}`)}>Xem ngay</Button>
              <Button size="lg" variant="secondary" onClick={() => setCountdown(null)}>Hủy</Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 sm:px-0">
          <Alert tone="error" className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => { setError(null); videoRef.current?.load(); }}>Thử lại</Button>
          </Alert>
        </div>
      )}
      <p className="hidden px-4 text-xs text-muted-foreground sm:block sm:px-0">
        Phím tắt: Space phát/dừng · ←/→ tua 10 giây · F toàn màn hình · M tắt tiếng
      </p>
    </div>
  );
}
