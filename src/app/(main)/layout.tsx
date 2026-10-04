import { Header } from "@/components/movie/header";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requirePageUser();
  return (
    <>
      <Header name={profile.display_name || profile.email} isAdmin={profile.role === "admin"} />
      <div className="flex-1">{children}</div>
    </>
  );
}
