"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { MovieGrid } from "./movie-card";
import type { MovieCardData } from "@/lib/services/catalog";

export function SearchClient({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<MovieCardData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    const url = new URL(window.location.href);
    if (term) url.searchParams.set("q", term);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!term) return setResults(null);
    const id = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (id === seq.current) {
          setResults(data.results);
          setError(false);
        }
      } catch {
        if (id === seq.current) setError(true);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 300); // debounce
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="space-y-6">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm phim theo tên hoặc mô tả…" className="pl-9" aria-label="Tìm kiếm" />
      </div>
      {error && <EmptyState>Không tìm kiếm được. Vui lòng thử lại.</EmptyState>}
      {loading && !results && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[2/3]" />)}</div>
      )}
      {results && results.length === 0 && !loading && <EmptyState>Không tìm thấy phim phù hợp.</EmptyState>}
      {results && results.length > 0 && <MovieGrid movies={results} />}
    </div>
  );
}
