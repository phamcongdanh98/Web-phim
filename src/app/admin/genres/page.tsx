import type { Metadata } from "next";
import { GenreManager } from "@/components/admin/genre-manager";
import { requirePageAdmin } from "@/lib/auth";
import { listGenres } from "@/lib/services/movies";

export const metadata: Metadata = { title: "Thể loại" };
export const dynamic = "force-dynamic";

export default async function GenresPage() {
  const { supabase } = await requirePageAdmin();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Thể loại</h1>
      <GenreManager genres={await listGenres(supabase)} />
    </div>
  );
}
