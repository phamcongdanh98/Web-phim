"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import type { Genre, Movie } from "@/types/db";

// Form values are plain strings/booleans (HTML inputs); `toPayload` converts to the API contract.
const formSchema = z.object({
  title: z.string().trim().min(1, "Vui lòng nhập tên phim."),
  original_title: z.string(),
  type: z.enum(["movie", "series"]),
  release_year: z.string().regex(/^(\d{4})?$/, "Năm gồm 4 chữ số."),
  description: z.string(),
  poster_url: z.string(),
  backdrop_url: z.string(),
  director: z.string(),
  country: z.string(),
  runtime_minutes: z.string().regex(/^\d*$/, "Chỉ nhập số."),
  age_rating: z.string(),
  featured: z.boolean(),
  published: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

interface TmdbResult {
  tmdbId: number;
  type: "movie" | "series";
  title: string;
  year: number | null;
  posterUrl: string | null;
}

const num = (s: string) => (s ? Number(s) : null);

export function MovieForm({
  movie,
  genres,
  genreIds,
  tmdbEnabled,
}: {
  movie?: Movie;
  genres: Genre[];
  genreIds?: string[];
  tmdbEnabled: boolean;
}) {
  const router = useRouter();
  const [selectedGenres, setSelectedGenres] = useState<string[]>(genreIds ?? []);
  const [tmdbId, setTmdbId] = useState<number | null>(movie?.tmdb_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<TmdbResult[]>([]);
  const [tmdbBusy, setTmdbBusy] = useState(false);
  const [uploading, setUploading] = useState<"poster" | "backdrop" | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: movie?.title ?? "",
      original_title: movie?.original_title ?? "",
      type: movie?.type ?? "movie",
      release_year: movie?.release_year?.toString() ?? "",
      description: movie?.description ?? "",
      poster_url: movie?.poster_url ?? "",
      backdrop_url: movie?.backdrop_url ?? "",
      director: movie?.director ?? "",
      country: movie?.country ?? "",
      runtime_minutes: movie?.runtime_minutes?.toString() ?? "",
      age_rating: movie?.age_rating ?? "",
      featured: movie?.featured ?? false,
      published: movie?.published ?? false,
    },
  });
  const { register, handleSubmit, setValue, control, formState } = form;

  async function onSubmit(v: FormValues) {
    setError(null);
    const payload = {
      ...v,
      release_year: num(v.release_year),
      runtime_minutes: num(v.runtime_minutes),
      genre_ids: selectedGenres,
      tmdb_id: tmdbId,
    };
    const res = await fetch(movie ? `/api/admin/movies/${movie.id}` : "/api/admin/movies", {
      method: movie ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Không lưu được phim.");
    if (movie) router.refresh();
    else router.push(`/admin/movies/${data.movie.id}/episodes`);
  }

  async function searchTmdb() {
    if (!tmdbQuery.trim()) return;
    setTmdbBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tmdb/search?q=${encodeURIComponent(tmdbQuery)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTmdbResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tìm được trên TMDB.");
    } finally {
      setTmdbBusy(false);
    }
  }

  async function applyTmdb(r: TmdbResult) {
    setTmdbBusy(true);
    try {
      const res = await fetch(`/api/admin/tmdb/${r.tmdbId}?type=${r.type}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setValue("title", d.title, { shouldDirty: true });
      setValue("original_title", d.original_title ?? "");
      setValue("type", d.type);
      setValue("description", d.description ?? "");
      setValue("release_year", d.release_year?.toString() ?? "");
      setValue("runtime_minutes", d.runtime_minutes?.toString() ?? "");
      setValue("poster_url", d.poster_url ?? "");
      setValue("backdrop_url", d.backdrop_url ?? "");
      setValue("director", d.director ?? "");
      setValue("country", d.country ?? "");
      setSelectedGenres(d.genre_ids);
      setTmdbId(d.tmdb_id);
      setTmdbResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lấy được chi tiết TMDB.");
    } finally {
      setTmdbBusy(false);
    }
  }

  async function upload(kind: "poster" | "backdrop", file: File) {
    setUploading(kind);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    try {
      const res = await fetch("/api/admin/upload-image", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setValue(kind === "poster" ? "poster_url" : "backdrop_url", data.url, { shouldDirty: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload ảnh thất bại.");
    } finally {
      setUploading(null);
    }
  }

  const poster = useWatch({ control, name: "poster_url" });
  const backdrop = useWatch({ control, name: "backdrop_url" });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-5">
      {tmdbEnabled && (
        <div className="rounded-lg border border-border p-3">
          <Label htmlFor="tmdb">Tự điền từ TMDB</Label>
          <div className="flex gap-2">
            <Input
              id="tmdb"
              value={tmdbQuery}
              onChange={(e) => setTmdbQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchTmdb())}
              placeholder="Gõ tên phim…"
            />
            <Button type="button" variant="secondary" onClick={searchTmdb} disabled={tmdbBusy}>
              {tmdbBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Tìm
            </Button>
          </div>
          {tmdbResults.length > 0 && (
            <ul className="mt-2 max-h-64 divide-y divide-border overflow-auto rounded border border-border">
              {tmdbResults.map((r) => (
                <li key={`${r.type}-${r.tmdbId}`}>
                  <button type="button" onClick={() => applyTmdb(r)} className="flex w-full items-center gap-3 p-2 text-left hover:bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.posterUrl ? <img src={r.posterUrl} alt="" className="h-14 w-10 rounded object-cover" /> : <div className="h-14 w-10 rounded bg-muted" />}
                    <span className="text-sm">
                      {r.title} {r.year && <span className="text-muted-foreground">({r.year})</span>}
                      <span className="ml-2 text-xs text-muted-foreground">{r.type === "series" ? "Phim bộ" : "Phim lẻ"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="title">Tên phim *</Label>
          <Input id="title" {...register("title")} />
          <FieldError message={formState.errors.title?.message} />
        </div>
        <div>
          <Label htmlFor="original_title">Tên gốc</Label>
          <Input id="original_title" {...register("original_title")} />
        </div>
        <div>
          <Label htmlFor="type">Loại</Label>
          <Select id="type" {...register("type")}>
            <option value="movie">Phim lẻ</option>
            <option value="series">Phim bộ</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="release_year">Năm</Label>
          <Input id="release_year" inputMode="numeric" {...register("release_year")} />
          <FieldError message={formState.errors.release_year?.message} />
        </div>
        <div>
          <Label htmlFor="runtime_minutes">Thời lượng (phút)</Label>
          <Input id="runtime_minutes" inputMode="numeric" {...register("runtime_minutes")} />
          <FieldError message={formState.errors.runtime_minutes?.message} />
        </div>
        <div>
          <Label htmlFor="director">Đạo diễn</Label>
          <Input id="director" {...register("director")} />
        </div>
        <div>
          <Label htmlFor="country">Quốc gia</Label>
          <Input id="country" {...register("country")} />
        </div>
        <div>
          <Label htmlFor="age_rating">Phân loại tuổi</Label>
          <Input id="age_rating" placeholder="T13, T16, C18…" {...register("age_rating")} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="description">Mô tả</Label>
          <Textarea id="description" rows={5} {...register("description")} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["poster", "backdrop"] as const).map((kind) => {
          const url = kind === "poster" ? poster : backdrop;
          return (
            <div key={kind}>
              <Label htmlFor={`${kind}_url`}>{kind === "poster" ? "Poster" : "Backdrop"}</Label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {url && <img src={url} alt="" className={kind === "poster" ? "mb-2 h-40 rounded" : "mb-2 h-24 rounded"} />}
              <div className="flex gap-2">
                <Input id={`${kind}_url`} placeholder="https://…" {...register(`${kind}_url`)} />
                <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted">
                  {uploading === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => e.target.files?.[0] && upload(kind, e.target.files[0])}
                  />
                  Tải lên
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Thể loại</legend>
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => {
            const on = selectedGenres.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedGenres((s) => (on ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                className={`rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-muted"}`}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("featured")} /> Nổi bật
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("published")} /> Công khai (published)
        </label>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} {movie ? "Lưu thay đổi" : "Tạo phim"}
      </Button>
    </form>
  );
}
