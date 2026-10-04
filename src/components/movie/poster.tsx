import Image from "next/image";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** `next/image` wrapper with a text fallback. Plain-http (local dev) URLs skip the optimizer, which blocks private IPs. */
export function Poster({
  src,
  alt,
  sizes,
  priority,
  className,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (!src) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center bg-muted p-2 text-center text-xs text-muted-foreground", className)}>
        <Film className="mr-1 h-4 w-4 shrink-0" /> {alt}
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={src.startsWith("http:")}
      className={cn("object-cover", className)}
    />
  );
}
