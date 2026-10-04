import "server-only";
import { DriveError } from "./errors";
import { fetchDriveMedia } from "./stream";
import { createResumableSession, type UploadSessionInput } from "./upload";
import { getRootFolderId } from "./integration";
import { rawGetFile, rawListChildren, rawTrashFile, rootGuard, FOLDER_MIME, type DriveFileInfo } from "./client";

export interface VideoMetadata extends DriveFileInfo {
  isFolder: boolean;
}

export interface VideoStorageProvider {
  getMetadata(fileId: string): Promise<VideoMetadata>;
  getStream(fileId: string, range: string | null, signal?: AbortSignal, ifRange?: string | null): Promise<Response>;
  createUploadSession(input: UploadSessionInput): Promise<string>;
  deleteFile(fileId: string): Promise<void>;
  listFiles(folderId?: string, pageToken?: string): Promise<{ items: VideoMetadata[]; nextPageToken: string | null }>;
}

const withFolderFlag = (f: DriveFileInfo): VideoMetadata => ({ ...f, isFolder: f.mimeType === FOLDER_MIME });

/** Google Drive implementation. Every operation is gated by assertInsideRoot(). */
export class GoogleDriveStorageProvider implements VideoStorageProvider {
  async getMetadata(fileId: string) {
    await rootGuard.assertInsideRoot(fileId);
    const f = await rawGetFile(fileId);
    if (f.trashed) throw new DriveError("not_found", "File đã bị xóa trên Drive.", 404);
    return withFolderFlag(f);
  }

  async getStream(fileId: string, range: string | null, signal?: AbortSignal, ifRange?: string | null) {
    await rootGuard.assertInsideRoot(fileId);
    return fetchDriveMedia({ fileId, range, ifRange, signal });
  }

  async createUploadSession(input: UploadSessionInput) {
    await rootGuard.assertInsideRoot(input.parentId);
    return createResumableSession(input);
  }

  async deleteFile(fileId: string) {
    if (fileId === getRootFolderId()) throw new DriveError("forbidden", "Không được xóa thư mục gốc.", 403);
    await rootGuard.assertInsideRoot(fileId);
    await rawTrashFile(fileId); // moved to Drive trash, recoverable
  }

  async listFiles(folderId = getRootFolderId(), pageToken?: string) {
    await rootGuard.assertInsideRoot(folderId);
    const { items, nextPageToken } = await rawListChildren(folderId, { pageToken });
    return { items: items.map(withFolderFlag), nextPageToken };
  }
}

let provider: VideoStorageProvider | null = null;
export function getStorageProvider(): VideoStorageProvider {
  return (provider ??= new GoogleDriveStorageProvider());
}
