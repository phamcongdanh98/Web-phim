import "server-only";
import { getAccessToken } from "./auth";
import { rawGetFile, FOLDER_MIME, withDrive } from "./client";
import { DriveError, DISCONNECTED_MESSAGE } from "./errors";
import { getIntegration, getRootFolderId } from "./integration";

export interface DriveStatus {
  state: "not_connected" | "connected" | "disconnected";
  email: string | null;
  rootFolderId: string | null;
  connectedAt: string | null;
}

/** Safe-to-render summary. Contains no tokens. */
export async function getDriveStatus(): Promise<DriveStatus> {
  const i = await getIntegration();
  if (!i) return { state: "not_connected", email: null, rootFolderId: null, connectedAt: null };
  return { state: i.status, email: i.google_account_email, rootFolderId: i.root_folder_id, connectedAt: i.connected_at };
}

/** Test connection: refresh token → files.get(root) → check we can create/edit inside it. */
export async function testDriveConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await getAccessToken({ forceRefresh: true });
    const root = await rawGetFile(getRootFolderId());
    if (root.mimeType !== FOLDER_MIME) return { ok: false, message: "GOOGLE_DRIVE_ROOT_FOLDER_ID không phải là folder." };
    const caps = await withDrive((d) =>
      d.files.get({ fileId: getRootFolderId(), fields: "capabilities(canAddChildren,canEdit)", supportsAllDrives: true }),
    );
    if (!caps.data.capabilities?.canAddChildren) {
      return { ok: false, message: "Tài khoản đã kết nối không có quyền ghi vào folder gốc." };
    }
    return { ok: true, message: "Google Drive hoạt động bình thường." };
  } catch (e) {
    if (e instanceof DriveError) {
      if (e.kind === "disconnected") return { ok: false, message: DISCONNECTED_MESSAGE };
      if (e.kind === "not_found") return { ok: false, message: "Không tìm thấy folder gốc. Kiểm tra GOOGLE_DRIVE_ROOT_FOLDER_ID." };
      return { ok: false, message: `${e.message}${e.reason ? ` (${e.reason})` : ""}` };
    }
    return { ok: false, message: "Không kiểm tra được kết nối Google Drive." };
  }
}
