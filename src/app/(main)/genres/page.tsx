import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/misc";
import { requirePageUser } from "@/lib/auth";
import { listGenres } from "@/lib/services/movies";

export const metadata: Metadata = { title: "Thể loại" };

export default async function GenresPage() {
  const { supabase } = await requirePageUser();
  const genres = await listGenres(supabase);
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Thể loại</h1>
      {genres.length === 0 ? (
        <EmptyState>Chưa có thể loại nào.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {genres.map((g) => (
            <Link key={g.id} href={`/genres/${g.slug}`} className="rounded-lg border border-border bg-card p-4 font-medium hover:border-primary">
              {g.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
