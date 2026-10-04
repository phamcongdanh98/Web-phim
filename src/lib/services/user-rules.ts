import { HttpError } from "@/lib/http/errors";

export interface UserState {
  role: "admin" | "user";
  is_active: boolean;
}

/**
 * Throws 409 if applying `patch` would leave the system without any *active* admin.
 * `activeAdminCount` is the number of active admins before the change.
 */
export function assertNotLastAdmin(current: UserState, patch: Partial<UserState>, activeAdminCount: number): void {
  const wasActiveAdmin = current.role === "admin" && current.is_active;
  if (!wasActiveAdmin) return;
  const next = { ...current, ...patch };
  const stillActiveAdmin = next.role === "admin" && next.is_active;
  if (!stillActiveAdmin && activeAdminCount <= 1) {
    throw new HttpError(409, "Không thể hạ quyền hoặc vô hiệu hóa admin cuối cùng.", { code: "LAST_ADMIN" });
  }
}
