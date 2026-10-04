"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/** Optimistic toggle: UI flips immediately and rolls back if the request fails. No page reload. */
export function FavoriteButton({
  movieId,
  initial,
  size = "default",
  iconOnly,
}: {
  movieId: string;
  initial: boolean;
  size?: "default" | "sm" | "lg";
  iconOnly?: boolean;
}) {
  const [fav, setFav] = useState(initial);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !fav;
    setFav(next);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/favorites/${movieId}`, { method: next ? "PUT" : "DELETE" });
        if (!res.ok) throw new Error();
      } catch {
        setFav(!next);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size={iconOnly ? "icon" : size}
      onClick={toggle}
      aria-pressed={fav}
      aria-label={fav ? "Bỏ yêu thích" : "Yêu thích"}
      data-testid="favorite-button"
    >
      <Heart className={cn("h-4 w-4", fav && "fill-primary text-primary")} />
      {!iconOnly && (fav ? "Đã yêu thích" : "Yêu thích")}
    </Button>
  );
}
