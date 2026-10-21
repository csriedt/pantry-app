"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";

import { EmptyState } from "@/components/composites/empty-state";
import { QuickAdd } from "@/components/composites/pantry/quick-add";
import { ShoppingListRow } from "@/components/composites/shopping-list-row";
import { useSessionUserId } from "@/components/providers/session-user-provider";
import { Button } from "@/components/ui/button";
import { useAddShoppingListItem } from "@/hooks/pantry/useAddShoppingListItem";
import { useCheckoffShoppingListItem } from "@/hooks/pantry/useCheckoffShoppingListItem";
import { usePantrySnapshot } from "@/hooks/pantry/usePantrySnapshot";
import { toPantryViews } from "@/lib/pantry-view";
import type { Food } from "@/types/catalog/food";

export const ShoppingListScreen = () => {
  // #region HOOKS
  const userId = useSessionUserId();
  const [snapshotQuery, dispatchSnapshot] = usePantrySnapshot(userId);
  const [addItem, , isAdding] = useAddShoppingListItem(userId);
  const [checkoff, , isCheckingOff] = useCheckoffShoppingListItem(userId);
  // #endregion

  // #region CONSTANTS
  const snapshot = snapshotQuery.data?.data;
  const views = toPantryViews(snapshot, []);

  const storedIds = new Set(
    (snapshot?.list.stored ?? []).map(row => row.food_id),
  );
  const rows = views.list;
  const isEmpty =
    userId !== null && !snapshotQuery.isPending && rows.length === 0;

  const errorMessage = snapshotQuery.error?.message;
  // #endregion

  // #region HANDLERS
  const onRetry = () => {
    if (userId !== null) dispatchSnapshot({ params: {} });
  };

  const onSelectFood = (food: Food) => {
    // A re-add would 409; the badge already says it is on the list.
    if (storedIds.has(food.id)) return;
    addItem({ food_id: food.id, source: "manual" });
  };

  const onHaveItAgain = (foodId: string) => {
    checkoff({ food_id: foodId });
  };
  // #endregion

  // #region LIFECYCLE
  useEffect(() => {
    if (userId === null) return;
    dispatchSnapshot({ params: {} });
  }, [userId, dispatchSnapshot]);
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

        <section className="pt-3.5">
          <div className="mb-1.5 font-mono text-micro tracking-[0.08em] text-muted-foreground uppercase">
            Add one
          </div>
          <QuickAdd
            onSelect={onSelectFood}
            placeholder="Add to the list"
            helperText="Add something you already know you need."
            createOnMissNote="saved to your foods only"
          />
          {isAdding ? (
            <p className="mt-2 text-[12px] text-muted-foreground">Adding…</p>
          ) : null}
        </section>

        {snapshotQuery.isError ? (
          <div role="alert" className="mt-4 text-center">
            <p className="m-0 text-[14px] text-muted-foreground">
              {errorMessage ?? "The list didn’t load."}
            </p>
            <Button className="mt-3" variant="secondary" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : snapshotQuery.isPending ? (
          <p className="mt-5 text-[13px] text-muted-foreground">
            Reading the list…
          </p>
        ) : isEmpty ? (
          <EmptyState headline="Nothing to buy yet." />
        ) : (
          <div className="mt-2">
            {rows.map(row => (
              <ShoppingListRow
                key={row.foodId}
                name={row.name}
                fact={row.fact}
                stored={row.stored}
                onHaveItAgain={() => onHaveItAgain(row.foodId)}
              />
            ))}
          </div>
        )}

        {isCheckingOff ? (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Moving that to the pantry…
          </p>
        ) : null}
      </div>
    </div>
  );
  // #endregion
};
