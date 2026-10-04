import type { Metadata } from "next";
import Link from "next/link";
import { DriveBrowser } from "@/components/admin/drive-browser";
import { Alert } from "@/components/ui/misc";
import { requirePageAdmin } from "@/lib/auth";
import { getDriveStatus } from "@/lib/google-drive/status";
import { DISCONNECTED_MESSAGE } from "@/lib/google-drive/errors";

export const metadata: Metadata = { title: "Google Drive" };
export const dynamic = "force-dynamic";

export default async function DrivePage({ searchParams }: PageProps<"/admin/drive">) {
  const { supabase } = await requirePageAdmin();
  const sp = await searchParams;
  const status = await getDriveStatus();

  if (status.state !== "connected") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Google Drive</h1>
        <Alert tone={status.state === "disconnected" ? "error" : "info"}>
          {status.state === "disconnected" ? DISCONNECTED_MESSAGE : "Chưa kết nối Google Drive."}{" "}
          <Link href="/admin/settings" className="underline">Vào Cài đặt</Link>
        </Alert>
      </div>
    );
  }
  const { data: movies } = await supabase.from("movies").select("id,title,type").order("title").limit(1000);
  const movieId = typeof sp.movieId === "string" ? sp.movieId : undefined;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Google Drive</h1>
      <DriveBrowser movies={(movies ?? []) as { id: string; title: string; type: "movie" | "series" }[]} initialMovieId={movieId} />
    </div>
  );
}
