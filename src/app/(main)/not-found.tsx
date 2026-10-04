import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-10 text-center">
      <h1 className="text-xl font-semibold">Không tìm thấy nội dung</h1>
      <p className="text-sm text-muted-foreground">Nội dung này không tồn tại hoặc đã bị gỡ.</p>
      <Button asChild><Link href="/">Về trang chủ</Link></Button>
    </div>
  );
}
