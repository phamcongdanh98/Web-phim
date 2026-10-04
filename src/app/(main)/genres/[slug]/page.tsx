import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MovieGrid } from "@/components/movie/movie-card";
import { EmptyState } from "@/components/ui/misc";
import { requirePageUser } from "@/lib/auth";
import { listByGenre } from "@/lib/services/catalog";

export const metadata: Metadata = { title: "Thể loại" };

export default async function GenrePage({ params }: PageProps<"/genres/[slug]">) {
  const { supabase } = await requirePageUser();
  const slug = (await params).slug;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) notFound();
  const { genre, movies } = await listByGenre(supabase, slug).catch(() => notFound());
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{genre.name}</h1>
      {movies.length === 0 ? <EmptyState>Chưa có phim nào.</EmptyState> : <MovieGrid movies={movies} />}
    </div>
  );
}
