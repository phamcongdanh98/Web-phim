import "server-only";
import type { drive_v3 } from "googleapis";
import { getDriveClient } from "./auth";
import { classifyDriveHttpError, DriveError } from "./errors";
import { createRootGuard } from "./folders";
import { getRootFolderId } from "./integration";

export const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,parents,trashed";

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  parents: string[];
}

function mapGaxiosError(e: unknown): DriveError {
  if (e instanceof DriveError) return e;
  const err = e as { code?: number | string; status?: number; response?: { status?: number; data?: unknown } };
  const status = Number(err.response?.status ?? err.status ?? err.code);
  if (Number.isFinite(status) && status >= 400) return classifyDriveHttpError(status, err.response?.data);
  return new DriveError("unavailable", "Không kết nối được tới Google Drive.");
}

/** Runs a googleapis call; on 401 refreshes the access token once and retries. Errors become DriveError. */
export async function withDrive<T>(fn: (drive: drive_v3.Drive) => Promise<T>): Promise<T> {
  try {
    return await fn(await getDriveClient());
  } catch (e) {
    const mapped = mapGaxiosError(e);
    if (mapped.status !== 401) throw mapped;
  }
  try {
    return await fn(await getDriveClient({ forceRefresh: true }));
  } catch (e) {
    throw mapGaxiosError(e);
  }
}

function toInfo(f: drive_v3.Schema$File): DriveFileInfo {
  return {
    id: f.id!,
    name: f.name ?? "",
    mimeType: f.mimeType ?? "",
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime ?? null,
    parents: f.parents ?? [],
  };
}

/** Raw metadata fetch. Callers outside this module must go through the provider (which guards root). */
export async function rawGetFile(fileId: string): Promise<DriveFileInfo & { trashed: boolean }> {
  const res = await withDrive((d) => d.files.get({ fileId, fields: FILE_FIELDS, supportsAllDrives: true }));
  return { ...toInfo(res.data), trashed: !!res.data.trashed };
}

export const rootGuard = createRootGuard(getRootFolderId, async (id) => {
  try {
    const f = await withDrive((d) => d.files.get({ fileId: id, fields: "parents,trashed", supportsAllDrives: true }));
    return f.data.trashed ? null : (f.data.parents ?? []);
  } catch (e) {
    if (e instanceof DriveError && e.kind === "not_found") return null;
    throw e;
  }
});

export async function rawListChildren(
  folderId: string,
  opts: { pageToken?: string; foldersOnly?: boolean; pageSize?: number } = {},
): Promise<{ items: DriveFileInfo[]; nextPageToken: string | null }> {
  const kinds = opts.foldersOnly
    ? `mimeType = '${FOLDER_MIME}'`
    : `(mimeType = '${FOLDER_MIME}' or mimeType contains 'video/')`;
  const res = await withDrive((d) =>
    d.files.list({
      q: `'${folderId}' in parents and trashed = false and ${kinds}`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      orderBy: "folder,name",
      pageSize: opts.pageSize ?? 200,
      pageToken: opts.pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    }),
  );
  return { items: (res.data.files ?? []).map(toInfo), nextPageToken: res.data.nextPageToken ?? null };
}

/** Finds or creates a folder under `parentId`, identified by a stable appProperties key (not by name). */
export async function ensureFolder(parentId: string, name: string, key: string): Promise<string> {
  const found = await withDrive((d) =>
    d.files.list({
      q: `'${parentId}' in parents and trashed = false and mimeType = '${FOLDER_MIME}' and appProperties has { key='phimweb_key' and value='${key}' }`,
      fields: "files(id)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    }),
  );
  const existing = found.data.files?.[0]?.id;
  if (existing) return existing;
  const created = await withDrive((d) =>
    d.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId], appProperties: { phimweb_key: key } },
      fields: "id",
      supportsAllDrives: true,
    }),
  );
  return created.data.id!;
}

export async function rawTrashFile(fileId: string): Promise<void> {
  await withDrive((d) => d.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true }));
}

export async function rawAboutEmail(): Promise<string | null> {
  const res = await withDrive((d) => d.about.get({ fields: "user(emailAddress)" }));
  return res.data.user?.emailAddress ?? null;
}
