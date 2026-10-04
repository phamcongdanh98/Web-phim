export type DriveErrorKind =
  | "disconnected" // refresh token revoked/expired (invalid_grant) or never connected
  | "not_found"
  | "forbidden" // missing permission on the file
  | "quota" // downloadQuotaExceeded
  | "rate_limit" // userRateLimitExceeded / 429
  | "outside_root" // file is not under GOOGLE_DRIVE_ROOT_FOLDER_ID
  | "range_not_satisfiable"
  | "unavailable"; // 5xx / network

export class DriveError extends Error {
  constructor(
    public kind: DriveErrorKind,
    message: string,
    public status?: number,
    /** Google's machine-readable reason (e.g. "downloadQuotaExceeded"); safe to log. */
    public reason?: string,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

export const USER_STREAM_ERROR = "Không thể tải video từ Google Drive. Vui lòng thử lại.";
export const DISCONNECTED_MESSAGE = "Google Drive đã mất kết nối. Vui lòng kết nối lại.";

/** Classifies a Drive REST error body + status into a DriveError. */
export function classifyDriveHttpError(status: number, body: unknown): DriveError {
  const err = (body as { error?: { errors?: { reason?: string }[]; message?: string; status?: string } })?.error;
  const reason = err?.errors?.[0]?.reason ?? err?.status;
  if (status === 404) return new DriveError("not_found", "File không tồn tại trên Drive.", status, reason);
  if (status === 416) return new DriveError("range_not_satisfiable", "Range không hợp lệ.", status, reason);
  if (status === 429) return new DriveError("rate_limit", "Drive giới hạn tốc độ.", status, reason);
  if (status === 403) {
    if (reason === "downloadQuotaExceeded") return new DriveError("quota", "File đã vượt hạn mức tải xuống của Drive.", status, reason);
    if (reason === "userRateLimitExceeded" || reason === "rateLimitExceeded")
      return new DriveError("rate_limit", "Drive giới hạn tốc độ.", status, reason);
    return new DriveError("forbidden", "Không đủ quyền truy cập file trên Drive.", status, reason);
  }
  if (status === 401) return new DriveError("disconnected", DISCONNECTED_MESSAGE, status, reason);
  return new DriveError("unavailable", "Google Drive tạm thời không phản hồi.", status, reason);
}
