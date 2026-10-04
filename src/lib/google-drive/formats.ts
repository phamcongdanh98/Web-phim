export type FormatSupport = "ok" | "warn";

export interface FormatInfo {
  support: FormatSupport;
  /** MIME we serve to the browser (forced from our side, Drive often returns octet-stream). */
  servedMime: string;
  message?: string;
}

const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
};

export function isVideoFile(mimeType: string | null | undefined, name: string | null | undefined): boolean {
  if (mimeType?.startsWith("video/")) return true;
  const ext = name?.split(".").pop()?.toLowerCase();
  return !!ext && ext in EXT_MIME;
}

/** MP4 (H.264 + AAC) is the supported target. Everything else is allowed with a warning. */
export function classifyVideo(mimeType: string | null | undefined, name: string | null | undefined): FormatInfo {
  const ext = name?.split(".").pop()?.toLowerCase() ?? "";
  const mime = (mimeType && mimeType !== "application/octet-stream" ? mimeType : EXT_MIME[ext]) ?? "video/mp4";
  if (mime === "video/mp4" || ext === "mp4" || ext === "m4v") return { support: "ok", servedMime: "video/mp4" };
  if (mime === "video/webm") {
    return { support: "warn", servedMime: "video/webm", message: "WebM có thể không phát được trên mọi trình duyệt (đặc biệt Safari cũ)." };
  }
  return {
    support: "warn",
    servedMime: mime,
    message: "Định dạng này có thể không tương thích với trình duyệt. Nên chuyển sang MP4 (H.264 + AAC).",
  };
}

export const FASTSTART_FIX_COMMAND = "ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4";
