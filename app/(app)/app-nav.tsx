"use client";

import { usePathname } from "next/navigation";

import {
  BottomNav,
  type NavDestination,
} from "@/components/composites/bottom-nav";

export function AppNav() {
  const pathname = usePathname();
  const active: NavDestination | undefined =
    pathname.startsWith("/pantry") || pathname.startsWith("/shopping-list")
      ? "pantry"
      : pathname.startsWith("/recipe-book")
        ? "recipe-book"
        : undefined;

  return <BottomNav active={active} />;
}
