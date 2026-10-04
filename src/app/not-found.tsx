import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-10 text-center">
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <Button asChild><Link href="/">Về trang chủ</Link></Button>
    </main>
  );
}
