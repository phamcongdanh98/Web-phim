"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-10 text-center">
      <h1 className="text-xl font-semibold">Đã có lỗi xảy ra</h1>
      <p className="text-sm text-muted-foreground">Vui lòng thử lại. Nếu lỗi vẫn tiếp diễn, hãy báo quản trị viên.</p>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}
