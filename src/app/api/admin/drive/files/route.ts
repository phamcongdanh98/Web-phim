import { api, json } from "@/lib/http/api";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/http/rate-limit";
import { getStorageProvider } from "@/lib/google-drive/provider";
import { getRootFolderId } from "@/lib/google-drive/integration";
import { badRequest } from "@/lib/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

/** Lists sub-folders and videos of a folder inside the root (the provider enforces containment). */
export const GET = api("admin.drive.files", async (request: Request) => {
  const { userId } = await requireAdmin();
  rateLimit(`drive:${userId}`, 120, 60_000);
  const sp = new URL(request.url).searchParams;
  const folderId = sp.get("folderId") || getRootFolderId();
  const pageToken = sp.get("pageToken") || undefined;
  if (!ID_RE.test(folderId) || (pageToken && pageToken.length > 2000)) throw badRequest();
  const provider = getStorageProvider();
  const [page, folder] = await Promise.all([
    provider.listFiles(folderId, pageToken),
    provider.getMetadata(folderId),
  ]);
  return json({
    folder: { id: folder.id, name: folder.name, isRoot: folder.id === getRootFolderId(), parents: folder.parents },
    items: page.items.map((i) => ({
      id: i.id, name: i.name, isFolder: i.isFolder, mimeType: i.mimeType, size: i.size, modifiedTime: i.modifiedTime,
    })),
    nextPageToken: page.nextPageToken,
  });
});
