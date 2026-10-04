import "server-only";
import { getAccessToken } from "./auth";
import { classifyDriveHttpError, DriveError } from "./errors";

export interface UploadSessionInput {
  name: string;
  mimeType: string;
  size: number;
  parentId: string;
  /** Website origin. Google ties the session to it; without it the browser's PUT is blocked by CORS. */
  origin: string;
}

/**
 * Starts a resumable upload session. The returned URL is a capability: whoever holds it can write
 * that one file. It is handed to the browser (never the OAuth token) and is never logged.
 */
export async function createResumableSession(input: UploadSessionInput): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mimeType,
      "X-Upload-Content-Length": String(input.size),
      Origin: input.origin,
    },
    body: JSON.stringify({ name: input.name, mimeType: input.mimeType, parents: [input.parentId] }),
  });
  if (!res.ok) throw classifyDriveHttpError(res.status, await res.json().catch(() => null));
  const location = res.headers.get("location");
  if (!location) throw new DriveError("unavailable", "Google không trả về upload URL.");
  return location;
}
