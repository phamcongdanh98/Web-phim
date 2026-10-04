import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Đang tải">
      <Skeleton className="h-[60vh] min-h-[360px] w-full rounded-none" />
      {[0, 1].map((r) => (
        <div key={r} className="space-y-3 px-4 sm:px-6">
          <Skeleton className="h-6 w-40" />
          <div className="flex gap-3 overflow-hidden">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[2/3] w-32 shrink-0 sm:w-40" />)}</div>
        </div>
      ))}
    </div>
  );
}
