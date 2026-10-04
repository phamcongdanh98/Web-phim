import type { Metadata } from "next";
import Link from "next/link";
import { Uploader } from "@/components/admin/uploader";
import { Alert } from "@/components/ui/misc";
import { requirePageAdmin } from "@/lib/auth";
import { getDriveStatus } from "@/lib/google-drive/status";
import { DISCONNECTED_MESSAGE } from "@/lib/google-drive/errors";

export const metadata: Metadata = { title: "Tải lên" };
export const dynamic = "force-dynamic";

export default async function UploadPage({ searchParams }: PageProps<"/admin/upload">) {
  const { supabase } = await requirePageAdmin();
  const sp = await searchParams;
  const status = await getDriveStatus();
  if (status.state !== "connected") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Tải lên</h1>
        <Alert tone="error">{status.state === "disconnected" ? DISCONNECTED_MESSAGE : "Chưa kết nối Google Drive."} <Link href="/admin/settings" className="underline">Vào Cài đặt</Link></Alert>
      </div>
    );
  }
  const { data: movies } = await supabase.from("movies").select("id,title,type").order("title").limit(1000);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Tải lên Google Drive</h1>
      <p className="text-sm text-muted-foreground">File được gửi thẳng từ trình duyệt tới Google Drive theo từng khối 16 MiB và có thể tiếp tục nếu mất kết nối.</p>
      <Uploader movies={(movies ?? []) as { id: string; title: string; type: "movie" | "series" }[]} initialMovieId={typeof sp.movieId === "string" ? sp.movieId : undefined} />
    </div>
  );
}
