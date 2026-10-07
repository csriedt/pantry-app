import Link from "next/link";
import { BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";

import { ChefNavCircle } from "./chef-nav-circle";

// #region TYPES
export type NavDestination = "pantry" | "recipe-book";

interface BottomNavProperties {
  active?: NavDestination;
}
// #endregion

export const BottomNav = (props: BottomNavProperties) => {
  // #region CONSTANTS
  const { active } = props;
  // #endregion

  // #region HELPERS
  const pantryIcon = (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path d="M5 9h14l-1 10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 9Z" />
      <path d="M4 6h16" />
      <path d="M9 6V4h6v2" />
    </svg>
  );

  const bookIcon = (
    <BookOpen aria-hidden="true" className="size-[22px]" strokeWidth={1.6} />
  );

  const itemClass = (isActive: boolean) =>
    cn(
      "flex min-h-12 flex-col items-center justify-center gap-[3px] text-micro tracking-[0.02em]",
      isActive ? "font-semibold" : "text-muted-foreground"
    );
  // #endregion

  // #region VIEW
  return (
    <nav className="grid grid-cols-[1fr_auto_1fr] items-center border-t border-strong bg-surface/95 px-2.5 pt-2 pb-1.5 backdrop-blur-xl">
      <Link
        href="/pantry"
        className={cn(
          itemClass(active === "pantry"),
          active === "pantry" && "text-rust"
        )}
      >
        {pantryIcon}
        Pantry
      </Link>
      <ChefNavCircle href="/chef" />
      <Link
        href="/recipe-book"
        className={cn(
          itemClass(active === "recipe-book"),
          active === "recipe-book" && "text-ink"
        )}
      >
        {bookIcon}
        Recipe book
      </Link>
    </nav>
  );
  // #endregion
};
