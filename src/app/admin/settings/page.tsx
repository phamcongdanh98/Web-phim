import type { Metadata } from "next";
import { Badge, Card, Alert } from "@/components/ui/misc";
import { DriveSettingsActions } from "@/components/admin/drive-settings";
import { getDriveStatus } from "@/lib/google-drive/status";
import { formatDateTime } from "@/lib/utils/format";
import { DISCONNECTED_MESSAGE } from "@/lib/google-drive/errors";

export const metadata: Metadata = { title: "Cài đặt" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const sp = await searchParams;
  const status = await getDriveStatus();
  const driveParam = typeof sp.drive === "string" ? sp.drive : null;
  const msg = typeof sp.msg === "string" ? sp.msg : null;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Cài đặt</h1>
      {driveParam === "connected" && <Alert tone="success">Đã kết nối Google Drive.</Alert>}
      {driveParam === "error" && <Alert tone="error">{msg ?? "Kết nối Google Drive thất bại."}</Alert>}
      {status.state === "disconnected" && <Alert tone="error">{DISCONNECTED_MESSAGE}</Alert>}

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Google Drive</h2>
          {status.state === "connected" ? (
            <Badge tone="success">Đã kết nối</Badge>
          ) : status.state === "disconnected" ? (
            <Badge tone="danger">Mất kết nối</Badge>
          ) : (
            <Badge tone="warning">Chưa kết nối</Badge>
          )}
        </div>
        {status.state === "not_connected" && <p className="text-sm text-muted-foreground">Chưa kết nối Google Drive.</p>}
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Tài khoản</dt>
          <dd>{status.email ?? "—"}</dd>
          <dt className="text-muted-foreground">Folder gốc</dt>
          <dd className="break-all font-mono text-xs">{status.rootFolderId ?? "—"}</dd>
          <dt className="text-muted-foreground">Kết nối lúc</dt>
          <dd>{formatDateTime(status.connectedAt)}</dd>
        </dl>
        <DriveSettingsActions state={status.state} />
      </Card>
    </div>
  );
}
