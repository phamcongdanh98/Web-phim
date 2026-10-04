import type { Metadata } from "next";
import { SearchClient } from "@/components/movie/search-client";

export const metadata: Metadata = { title: "Tìm kiếm" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Tìm kiếm</h1>
      <SearchClient initialQuery={q} />
    </div>
  );
}
