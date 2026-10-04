import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-[40vh] min-h-[260px] w-full rounded-none" />
      <div className="mx-auto -mt-32 flex max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:px-6">
        <Skeleton className="mx-auto aspect-[2/3] w-44 sm:mx-0 sm:w-56" />
        <div className="flex-1 space-y-3 pt-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
