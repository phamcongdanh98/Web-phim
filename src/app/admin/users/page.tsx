import type { Metadata } from "next";
import { UserManager } from "@/components/admin/user-manager";
import { requirePageAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/services/users";

export const metadata: Metadata = { title: "Người dùng" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { userId } = await requirePageAdmin();
  const users = await listUsers();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Người dùng</h1>
      <UserManager users={users} currentUserId={userId} />
    </div>
  );
}
