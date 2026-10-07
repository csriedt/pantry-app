"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { EmptyState } from "@/components/composites/empty-state";
import { ShoppingListRow } from "@/components/composites/shopping-list-row";

// #region TYPES
export type ShoppingListState = "populated" | "empty";

interface ShoppingListScreenProperties {
  state: ShoppingListState;
}
// #endregion

// Placeholder fixtures — the real reads land with the service-flow wiring.
const SHOPPING: { name: string; fact?: string; stored?: boolean }[] = [
  { name: "Olive oil", fact: "0 left · used 6× in 30 days" },
  { name: "Cumin", stored: true },
];

export const ShoppingListScreen = (props: ShoppingListScreenProperties) => {
  // #region CONSTANTS
  const { state } = props;
  // #endregion

  // #region VIEW
  return (
    <div className="pb-6">
      <header className="flex items-center gap-3 px-5 pt-1 pb-3">
        <Link
          href="/pantry"
          aria-label="Back"
          className="grid size-11 flex-none place-items-center rounded-full border border-strong bg-surface"
        >
          <ChevronLeft
            aria-hidden="true"
            className="size-[18px]"
            strokeWidth={1.7}
          />
        </Link>
        <h2 className="font-display text-[25px] font-semibold tracking-[-0.02em]">
          Shopping list
        </h2>
      </header>

      <div className="px-5">
        <p className="m-0 text-[12px] text-muted-foreground">
          From your own records. Nothing is predicted.
        </p>
        {state === "empty" ? (
          <EmptyState headline="Nothing to buy yet." />
        ) : (
          <div className="mt-2">
            {SHOPPING.map(row => (
              <ShoppingListRow
                key={row.name}
                name={row.name}
                fact={row.fact}
                stored={row.stored}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
  // #endregion
};
