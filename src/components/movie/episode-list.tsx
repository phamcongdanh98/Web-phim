"use client";

import Link from "next/link";
import { useState } from "react";
import { Play } from "lucide-react";
import { ProgressBar } from "@/components/ui/misc";
import { Select } from "@/components/ui/input";
import { formatDuration } from "@/lib/utils/format";
import type { Episode, WatchProgress } from "@/types/db";

export function EpisodeList({ episodes, progress }: { episodes: Episode[]; progress: Record<string, WatchProgress> }) {
  const seasons = [...new Set(episodes.map((e) => e.season_number))].sort((a, b) => a - b);
  const [season, setSeason] = useState(seasons[0] ?? 1);
  const list = episodes.filter((e) => e.season_number === season);

  return (
    <div className="space-y-3">
      {seasons.length > 1 && (
        <Select value={season} onChange={(e) => setSeason(Number(e.target.value))} className="w-40" aria-label="Chọn mùa">
          {seasons.map((s) => (
            <option key={s} value={s}>Mùa {s}</option>
          ))}
        </Select>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {list.map((ep) => {
          const p = progress[ep.id];
          return (
            <li key={ep.id}>
              <Link href={`/watch/${ep.id}`} className="flex items-start gap-3 p-3 hover:bg-muted" data-testid="episode-link">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm">{ep.episode_number}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    {ep.title || `Tập ${ep.episode_number}`}
                    {ep.duration_seconds ? <span className="text-xs font-normal text-muted-foreground">{formatDuration(ep.duration_seconds)}</span> : null}
                    {p?.completed && <span className="text-xs font-normal text-emerald-400">Đã xem</span>}
                  </span>
                  {ep.description && <span className="line-clamp-2 block text-sm text-muted-foreground">{ep.description}</span>}
                  {p && !p.completed && <ProgressBar value={Number(p.percentage)} className="mt-2" />}
                </span>
                <Play className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
