import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Play } from "lucide-react";
import { Poster } from "@/components/movie/poster";
import { FavoriteButton } from "@/components/movie/favorite-button";
import { EpisodeList } from "@/components/movie/episode-list";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { requirePageUser } from "@/lib/auth";
import { getMovieDetail } from "@/lib/services/catalog";
import { formatRuntimeMinutes } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Chi tiết phim" };

export default async function MovieDetailPage({ params }: PageProps<"/movie/[slug]">) {
  const { supabase, userId } = await requirePageUser();
  const slug = (await params).slug;
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) notFound();
  const d = await getMovieDetail(supabase, userId, slug).catch(() => notFound());
  const { movie } = d;
  const facts: [string, string | number | null][] = [
    ["Năm", movie.release_year],
    ["Thời lượng", formatRuntimeMinutes(movie.runtime_minutes) || null],
    ["Quốc gia", movie.country],
    ["Đạo diễn", movie.director],
    ["Phân loại", movie.age_rating],
  ];

  return (
    <div>
      <div className="relative h-[40vh] min-h-[260px] w-full overflow-hidden">
        <Poster src={movie.backdrop_url ?? movie.poster_url} alt={movie.title} sizes="100vw" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-background/30" />
      </div>
      <div className="relative z-10 mx-auto -mt-32 max-w-6xl space-y-8 px-4 pb-12 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="relative mx-auto aspect-[2/3] w-44 shrink-0 overflow-hidden rounded-lg shadow-xl sm:mx-0 sm:w-56">
            <Poster src={movie.poster_url} alt={movie.title} sizes="224px" priority />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <h1 className="text-3xl font-bold">{movie.title}</h1>
            {movie.original_title && movie.original_title !== movie.title && <p className="text-muted-foreground">{movie.original_title}</p>}
            <div className="flex flex-wrap gap-2">
              <Badge>{movie.type === "series" ? "Phim bộ" : "Phim lẻ"}</Badge>
              {d.genres.map((g) => <Link key={g.id} href={`/genres/${g.slug}`}><Badge className="hover:bg-border">{g.name}</Badge></Link>)}
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {facts.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="inline text-muted-foreground">{k}: </dt><dd className="inline">{v}</dd></div>
              ))}
            </dl>
            {movie.description && <p className="max-w-3xl leading-relaxed">{movie.description}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              {d.playEpisodeId && (
                <Button asChild size="lg">
                  <Link href={`/watch/${d.playEpisodeId}`} data-testid="watch-button">
                    <Play className="h-5 w-5 fill-current" /> {d.hasProgress ? "Tiếp tục xem" : "Xem"}
                  </Link>
                </Button>
              )}
              <FavoriteButton movieId={movie.id} initial={d.isFavorite} size="lg" />
            </div>
          </div>
        </div>

        {d.episodes.length === 0 ? (
          <EmptyState>Phim này chưa có tập nào để xem.</EmptyState>
        ) : (
          movie.type === "series" && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Danh sách tập</h2>
              <EpisodeList episodes={d.episodes} progress={d.progress} />
            </section>
          )
        )}
      </div>
    </div>
  );
}
