"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";

export function DriveSettingsActions({ state }: { state: "not_connected" | "connected" | "disconnected" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"test" | "disconnect" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function call(kind: "test" | "disconnect") {
    if (kind === "disconnect" && !confirm("Ngắt kết nối Google Drive? Người xem sẽ không phát được phim cho tới khi kết nối lại.")) return;
    setBusy(kind);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/drive/${kind}`, { method: "POST" });
      const data = await res.json();
      if (kind === "test") setResult(res.ok ? data : { ok: false, message: data.error ?? "Lỗi không xác định." });
      else router.refresh();
    } catch {
      setResult({ ok: false, message: "Không gọi được máy chủ." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href="/api/google/connect">{state === "connected" ? "Kết nối lại (Reconnect)" : "Kết nối Google Drive"}</a>
        </Button>
        {state !== "not_connected" && (
          <>
            <Button variant="outline" onClick={() => call("test")} disabled={busy !== null}>
              {busy === "test" && <Loader2 className="h-4 w-4 animate-spin" />} Test connection
            </Button>
            <Button variant="destructive" onClick={() => call("disconnect")} disabled={busy !== null}>
              {busy === "disconnect" && <Loader2 className="h-4 w-4 animate-spin" />} Ngắt kết nối
            </Button>
          </>
        )}
      </div>
      {result && <Alert tone={result.ok ? "success" : "error"}>{result.message}</Alert>}
    </div>
  );
}
