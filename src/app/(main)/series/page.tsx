import type { Metadata } from "next";
import { MovieGrid } from "@/components/movie/movie-card";
import { EmptyState } from "@/components/ui/misc";
import { requirePageUser } from "@/lib/auth";
import { listByType } from "@/lib/services/catalog";

export const metadata: Metadata = { title: "Phim bộ" };

export default async function Page() {
  const { supabase } = await requirePageUser();
  const movies = await listByType(supabase, "series");
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Phim bộ</h1>
      {movies.length === 0 ? <EmptyState>Chưa có phim nào.</EmptyState> : <MovieGrid movies={movies} />}
    </div>
  );
}
