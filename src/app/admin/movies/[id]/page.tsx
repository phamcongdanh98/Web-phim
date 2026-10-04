import type { Metadata } from "next";
import Link from "next/link";
import { MovieForm } from "@/components/admin/movie-form";
import { Button } from "@/components/ui/button";
import { requirePageAdmin } from "@/lib/auth";
import { getMovieWithGenreIds, listGenres } from "@/lib/services/movies";
import { tmdbEnabled } from "@/lib/services/tmdb";
import { parseUuid } from "@/lib/validation/common";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Sửa phim" };
export const dynamic = "force-dynamic";

export default async function EditMoviePage({ params }: PageProps<"/admin/movies/[id]">) {
  const { supabase } = await requirePageAdmin();
  let id: string;
  try {
    id = parseUuid((await params).id);
  } catch {
    notFound();
  }
  const [{ movie, genreIds }, genres] = await Promise.all([
    getMovieWithGenreIds(supabase, id).catch(() => notFound()),
    listGenres(supabase),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sửa: {movie.title}</h1>
        <Button asChild variant="outline"><Link href={`/admin/movies/${movie.id}/episodes`}>Quản lý tập</Link></Button>
      </div>
      <MovieForm movie={movie} genres={genres} genreIds={genreIds} tmdbEnabled={tmdbEnabled()} />
    </div>
  );
}
