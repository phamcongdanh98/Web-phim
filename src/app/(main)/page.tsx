import Link from "next/link";
import { Hero } from "@/components/movie/hero";
import { MovieCard, MovieRow, RowItem } from "@/components/movie/movie-card";
import { EmptyState } from "@/components/ui/misc";
import { requirePageUser } from "@/lib/auth";
import { getHomeData, type MovieCardData } from "@/lib/services/catalog";

export default async function HomePage() {
  const { supabase, userId } = await requirePageUser();
  const d = await getHomeData(supabase, userId);

  if (!d.hero) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <EmptyState>Chưa có phim nào.</EmptyState>
      </div>
    );
  }
  const row = (title: string, list: MovieCardData[]) =>
    list.length > 0 && (
      <MovieRow title={title}>
        {list.map((m) => (
          <RowItem key={m.id}><MovieCard movie={m} /></RowItem>
        ))}
      </MovieRow>
    );

  return (
    <div className="space-y-8 pb-12">
      <Hero movie={d.hero} isFavorite={d.favoriteIds.includes(d.hero.id)} />
      {d.continueWatching.length > 0 && (
        <MovieRow title="Xem tiếp">
          {d.continueWatching.map((c) => (
            <RowItem key={c.episodeId}>
              <MovieCard movie={c.movie} href={`/watch/${c.episodeId}`} progress={c.percentage} badge={c.label} />
            </RowItem>
          ))}
        </MovieRow>
      )}
      {row("Mới thêm", d.latest)}
      {row("Nổi bật", d.featured)}
      {row("Phim lẻ", d.movies)}
      {row("Phim bộ", d.series)}
      {d.byGenre.map((g) => (
        <MovieRow key={g.genre.id} title={g.genre.name}>
          {g.movies.map((m) => (
            <RowItem key={m.id}><MovieCard movie={m} /></RowItem>
          ))}
        </MovieRow>
      ))}
      <p className="px-4 text-center text-xs text-muted-foreground">
        <Link href="/genres" className="underline">Xem tất cả thể loại</Link>
      </p>
    </div>
  );
}
