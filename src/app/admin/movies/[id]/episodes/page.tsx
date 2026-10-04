import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EpisodeManager } from "@/components/admin/episode-manager";
import { requirePageAdmin } from "@/lib/auth";
import { parseUuid } from "@/lib/validation/common";
import { getMovieWithGenreIds, listEpisodes } from "@/lib/services/movies";
import type { Subtitle } from "@/types/db";

export const metadata: Metadata = { title: "Các tập" };
export const dynamic = "force-dynamic";

export default async function EpisodesPage({ params }: PageProps<"/admin/movies/[id]/episodes">) {
  const { supabase } = await requirePageAdmin();
  let id: string;
  try {
    id = parseUuid((await params).id);
  } catch {
    notFound();
  }
  const { movie } = await getMovieWithGenreIds(supabase, id).catch(() => notFound());
  const episodes = await listEpisodes(supabase, id);
  const { data: subs } = await supabase.from("subtitles").select("*").in("episode_id", episodes.map((e) => e.id));
  const withSubs = episodes.map((e) => ({ ...e, subtitles: ((subs ?? []) as Subtitle[]).filter((s) => s.episode_id === e.id) }));
  return (
    <div className="space-y-4">
      <div>
        <Link href={`/admin/movies/${id}`} className="text-sm text-muted-foreground hover:underline">← {movie.title}</Link>
        <h1 className="text-2xl font-semibold">Các tập</h1>
      </div>
      <EpisodeManager movieId={id} isSeries={movie.type === "series"} episodes={withSubs} />
    </div>
  );
}
