import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorageProvider, type VideoMetadata } from "@/lib/google-drive/provider";
import { getRootFolderId } from "@/lib/google-drive/integration";
import { isVideoFile } from "@/lib/google-drive/formats";
import { diffSync, type SyncReport } from "./sync-diff";
export type { SyncReport } from "./sync-diff";

const MAX_FOLDERS = 500;
const MAX_FILES = 10_000;

/** Walks the whole root (BFS) collecting video files. Throws on any Drive error so we never act on a partial scan. */
async function scanRoot(): Promise<VideoMetadata[]> {
  const provider = getStorageProvider();
  const queue = [getRootFolderId()];
  const files: VideoMetadata[] = [];
  let folders = 0;
  while (queue.length) {
    const folderId = queue.shift()!;
    if (++folders > MAX_FOLDERS) throw new Error("Cây thư mục quá lớn để quét.");
    let pageToken: string | undefined;
    do {
      const page = await provider.listFiles(folderId, pageToken);
      for (const item of page.items) {
        if (item.isFolder) queue.push(item.id);
        else if (isVideoFile(item.mimeType, item.name)) files.push(item);
      }
      if (files.length > MAX_FILES) throw new Error("Quá nhiều file để quét.");
      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken);
  }
  return files;
}

/**
 * Compares Drive with the DB. Never deletes DB rows: only flips file_status
 * ('missing' when gone, back to 'ok' when it reappears). The admin decides what to remove.
 */
export async function syncDrive(supabase: SupabaseClient): Promise<SyncReport> {
  const driveFiles = await scanRoot();
  const { data: eps, error } = await supabase.from("episodes").select("id,storage_file_id,file_status,storage_file_name");
  if (error) throw new Error(error.message);
  const report = diffSync(driveFiles, eps ?? []);

  if (report.markMissing.length) {
    await supabase.from("episodes").update({ file_status: "missing" }).in("id", report.markMissing);
  }
  if (report.markRecovered.length) {
    await supabase.from("episodes").update({ file_status: "ok" }).in("id", report.markRecovered);
  }
  return report;
}
