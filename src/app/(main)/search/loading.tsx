import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 max-w-xl" />
    </div>
  );
}
