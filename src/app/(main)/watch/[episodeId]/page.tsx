import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Player } from "@/components/player/player";
import { Alert } from "@/components/ui/misc";
import { requirePageUser } from "@/lib/auth";
import { getWatchData } from "@/lib/services/catalog";
import { uuidSchema } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Đang xem" };

export default async function WatchPage({ params }: PageProps<"/watch/[episodeId]">) {
  const { supabase, userId } = await requirePageUser();
  const { episodeId } = await params;
  if (!uuidSchema.safeParse(episodeId).success) notFound();
  const d = await getWatchData(supabase, userId, episodeId).catch(() => notFound());
  const { episode, movie } = d;
  const isSeries = movie.type === "series";
  const epLabel = isSeries ? `Mùa ${episode.season_number} · Tập ${episode.episode_number}${episode.title ? ` — ${episode.title}` : ""}` : null;

  if (episode.file_status === "missing") {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Alert tone="error">File video của tập này hiện không khả dụng. Vui lòng báo quản trị viên.</Alert>
      </div>
    );
  }
  return (
    <Player
      key={episode.id}
      episodeId={episode.id}
      title={movie.title}
      subtitle={epLabel}
      backHref={`/movie/${movie.slug}`}
      startAt={d.startAt}
      next={d.next}
      subtitles={d.subtitles.map((s) => ({ id: s.id, label: s.label, language: s.language, is_default: s.is_default }))}
    />
  );
}
