import type { Metadata } from "next";
import { MovieGrid } from "@/components/movie/movie-card";
import { EmptyState } from "@/components/ui/misc";
import { requirePageUser } from "@/lib/auth";
import { getFavorites } from "@/lib/services/catalog";

export const metadata: Metadata = { title: "Yêu thích" };

export default async function FavoritesPage() {
  const { supabase, userId } = await requirePageUser();
  const movies = await getFavorites(supabase, userId);
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Yêu thích</h1>
      {movies.length === 0 ? <EmptyState>Bạn chưa có phim yêu thích.</EmptyState> : <MovieGrid movies={movies} />}
    </div>
  );
}
