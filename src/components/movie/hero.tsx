import Link from "next/link";
import { Play } from "lucide-react";
import { Poster } from "./poster";
import { FavoriteButton } from "./favorite-button";
import { Button } from "@/components/ui/button";
import { formatRuntimeMinutes } from "@/lib/utils/format";
import type { MovieCardData } from "@/lib/services/catalog";

export function Hero({ movie, isFavorite }: { movie: MovieCardData; isFavorite: boolean }) {
  return (
    <section className="relative h-[60vh] min-h-[360px] w-full overflow-hidden">
      <Poster src={movie.backdrop_url ?? movie.poster_url} alt={movie.title} sizes="100vw" priority />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />
      <div className="absolute bottom-0 left-0 max-w-2xl space-y-3 p-4 pb-8 sm:p-8">
        <h1 className="text-3xl font-bold sm:text-5xl">{movie.title}</h1>
        <p className="text-sm text-muted-foreground">
          {[movie.release_year, movie.type === "series" ? "Phim bộ" : "Phim lẻ", formatRuntimeMinutes(movie.runtime_minutes), movie.age_rating].filter(Boolean).join(" · ")}
        </p>
        {movie.description && <p className="line-clamp-3 text-sm sm:text-base">{movie.description}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="lg">
            <Link href={`/movie/${movie.slug}`}>
              <Play className="h-5 w-5 fill-current" /> Xem ngay
            </Link>
          </Button>
          <FavoriteButton movieId={movie.id} initial={isFavorite} size="lg" />
        </div>
      </div>
    </section>
  );
}
