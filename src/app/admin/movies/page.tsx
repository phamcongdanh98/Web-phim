import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/input";
import { MovieRowActions } from "@/components/admin/movie-row-actions";
import { requirePageAdmin } from "@/lib/auth";
import { listMoviesAdmin, PAGE_SIZE } from "@/lib/services/movies";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Phim" };
export const dynamic = "force-dynamic";

async function MovieTable({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const { supabase } = await requirePageAdmin();
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const page = Math.max(1, Number(str("page")) || 1);
  const type = str("type") === "movie" || str("type") === "series" ? (str("type") as "movie" | "series") : undefined;
  const status = str("status") === "published" || str("status") === "draft" ? (str("status") as "published" | "draft") : undefined;
  const q = str("q");
  const { movies, total } = await listMoviesAdmin(supabase, { page, q, type, status });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (type) u.set("type", type);
    if (status) u.set("status", status);
    u.set("page", String(p));
    return `/admin/movies?${u}`;
  };

  if (movies.length === 0) return <EmptyState>Chưa có phim nào.</EmptyState>;
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="p-3">Tên phim</th>
              <th className="p-3">Loại</th>
              <th className="p-3">Năm</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {movies.map((m) => (
              <tr key={m.id}>
                <td className="p-3 font-medium">{m.title}</td>
                <td className="p-3">{m.type === "series" ? "Phim bộ" : "Phim lẻ"}</td>
                <td className="p-3">{m.release_year ?? "—"}</td>
                <td className="p-3">
                  <Badge tone={m.published ? "success" : "warning"}>{m.published ? "Công khai" : "Nháp"}</Badge>
                  {m.featured && <Badge className="ml-1">Nổi bật</Badge>}
                </td>
                <td className="p-3"><div className="flex justify-end"><MovieRowActions id={m.id} title={m.title} published={m.published} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} phim · Trang {page}/{pages}</span>
        <div className="flex gap-2">
          {page > 1 && <Button asChild variant="outline" size="sm"><Link href={href(page - 1)}>Trước</Link></Button>}
          {page < pages && <Button asChild variant="outline" size="sm"><Link href={href(page + 1)}>Sau</Link></Button>}
        </div>
      </div>
    </>
  );
}

export default async function AdminMoviesPage({ searchParams }: PageProps<"/admin/movies">) {
  const sp = await searchParams;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Phim</h1>
        <Button asChild><Link href="/admin/movies/new"><Plus className="h-4 w-4" /> Thêm phim</Link></Button>
      </div>
      <form className="flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={typeof sp.q === "string" ? sp.q : ""} placeholder="Tìm theo tên…" className="max-w-xs" />
        <Select name="type" defaultValue={typeof sp.type === "string" ? sp.type : ""} className="w-36">
          <option value="">Mọi loại</option>
          <option value="movie">Phim lẻ</option>
          <option value="series">Phim bộ</option>
        </Select>
        <Select name="status" defaultValue={typeof sp.status === "string" ? sp.status : ""} className="w-40">
          <option value="">Mọi trạng thái</option>
          <option value="published">Công khai</option>
          <option value="draft">Nháp</option>
        </Select>
        <Button type="submit" variant="secondary">Lọc</Button>
      </form>
      <Suspense fallback={<div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>}>
        <MovieTable sp={sp} />
      </Suspense>
    </div>
  );
}
