import Link from "next/link";
import { Play } from "lucide-react";
import { Poster } from "./poster";
import { ProgressBar } from "@/components/ui/misc";
import type { MovieCardData } from "@/lib/services/catalog";

/** Poster card. The play affordance is always visible on touch (no hover dependency) and fades in on desktop hover. */
export function MovieCard({
  movie,
  href,
  progress,
  badge,
  priority,
}: {
  movie: Pick<MovieCardData, "slug" | "title" | "poster_url" | "release_year">;
  href?: string;
  progress?: number;
  badge?: string | null;
  priority?: boolean;
}) {
  return (
    <Link href={href ?? `/movie/${movie.slug}`} className="group block w-full" data-testid="movie-card">
      <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-muted transition-transform duration-200 md:group-hover:scale-[1.04]">
        <Poster
          src={movie.poster_url}
          alt={movie.title}
          priority={priority}
          sizes="(min-width:1280px) 16vw, (min-width:1024px) 20vw, (min-width:640px) 25vw, 45vw"
        />
        <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          <Play className="h-4 w-4 fill-current" />
        </span>
        {badge && <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px]">{badge}</span>}
        {progress != null && <ProgressBar value={progress} className="absolute inset-x-0 bottom-0 h-1 rounded-none" />}
      </div>
      <p className="mt-2 truncate text-sm font-medium">{movie.title}</p>
      {movie.release_year && <p className="text-xs text-muted-foreground">{movie.release_year}</p>}
    </Link>
  );
}

export function MovieGrid({ movies }: { movies: MovieCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {movies.map((m, i) => (
        <MovieCard key={m.id} movie={m} priority={i < 6} />
      ))}
    </div>
  );
}

/** Horizontally scrolling row; native scroll-snap so it works with touch and trackpads. */
export function MovieRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="px-4 text-lg font-semibold sm:px-6">{title}</h2>
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:px-6">{children}</div>
    </section>
  );
}

export function RowItem({ children }: { children: React.ReactNode }) {
  return <div className="w-32 shrink-0 snap-start sm:w-40 lg:w-44">{children}</div>;
}
