"use client";

import { Button } from "@/components/ui/button";

// Deliberately shows no error details: stack traces never reach the browser.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-10 text-center">
      <h1 className="text-xl font-semibold">Đã có lỗi xảy ra</h1>
      <Button onClick={reset}>Thử lại</Button>
    </main>
  );
}
