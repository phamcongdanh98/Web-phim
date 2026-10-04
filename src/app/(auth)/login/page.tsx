import type { Metadata } from "next";
import { Film } from "lucide-react";
import { Card } from "@/components/ui/misc";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const initialError =
    sp.error === "disabled" ? "Tài khoản của bạn hiện không được phép truy cập hệ thống." : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2 text-xl font-semibold">
          <Film className="h-6 w-6 text-primary" /> Phim Web
        </div>
        <LoginForm next={next} initialError={initialError} />
        <p className="mt-4 text-xs text-muted-foreground">Chưa có tài khoản? Liên hệ quản trị viên.</p>
      </Card>
    </main>
  );
}
