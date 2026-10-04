import type { Metadata } from "next";
import { requirePageAdmin } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/sidebar";

export const metadata: Metadata = { title: { default: "Quản trị", template: "%s · Quản trị" } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requirePageAdmin(); // backend check: hiding links is not authorisation
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-border bg-card md:w-56 md:border-b-0 md:border-r">
        <div className="hidden px-5 py-4 text-lg font-semibold md:block">Quản trị</div>
        <AdminSidebar />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
