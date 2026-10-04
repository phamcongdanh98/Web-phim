import type { Metadata } from "next";
import { MovieForm } from "@/components/admin/movie-form";
import { requirePageAdmin } from "@/lib/auth";
import { listGenres } from "@/lib/services/movies";
import { tmdbEnabled } from "@/lib/services/tmdb";

export const metadata: Metadata = { title: "Thêm phim" };
export const dynamic = "force-dynamic";

export default async function NewMoviePage() {
  const { supabase } = await requirePageAdmin();
  const genres = await listGenres(supabase);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Thêm phim</h1>
      <MovieForm genres={genres} tmdbEnabled={tmdbEnabled()} />
    </div>
  );
}
