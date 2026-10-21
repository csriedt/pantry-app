"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Settings } from "lucide-react";

import { AskChefCard } from "@/components/composites/ask-chef-card";
import { CategoryHeader } from "@/components/composites/category-header";
import { EmptyState } from "@/components/composites/empty-state";
import { ItemRow } from "@/components/composites/item-row";
import { ShoppingListRow } from "@/components/composites/shopping-list-row";
import { ItemSheet } from "@/components/composites/pantry/item-sheet";
import { QuickAdd } from "@/components/composites/pantry/quick-add";
import { useSessionUserId } from "@/components/providers/session-user-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListCategories } from "@/hooks/catalog/useListCategories";
import { usePantrySnapshot } from "@/hooks/pantry/usePantrySnapshot";
import { useUpsertPantryItem } from "@/hooks/pantry/useUpsertPantryItem";
import { toPantryViews } from "@/lib/pantry-view";
import type { PantryItem } from "@/types/pantry/pantryItem";

export const PantryScreen = () => {
  // #region HOOKS
  const router = useRouter();
  const userId = useSessionUserId();
  const [snapshotQuery, dispatchSnapshot] = usePantrySnapshot(userId);
  const [categoriesQuery, dispatchCategories] = useListCategories();
  const [upsert, , isAdding] = useUpsertPantryItem(userId);
  const [openFoodId, setOpenFoodId] = useState<string | null>(null);
  // #endregion

  // #region CONSTANTS
  const snapshot = snapshotQuery.data?.data;
  const categories = categoriesQuery.data?.data?.categories ?? [];
  const views = toPantryViews(snapshot, categories);

  const errorMessage = snapshotQuery.error?.message;
  const settled =
    userId !== null &&
    !snapshotQuery.isPending &&
    !categoriesQuery.isPending;

  const viewState = snapshotQuery.isError
    ? "error"
    : !settled
      ? "loading"
      : views.itemCount === 0
        ? "first-run"
        : "steady";

  const isFirstRun = viewState === "first-run";
  const openItem: PantryItem | null =
    snapshot?.items.find(item => item.food_id === openFoodId) ?? null;
  // #endregion

  // #region HELPERS
  const renderPantrySkeleton = () => (
    <section className="px-5 pt-3.5">
      <Skeleton className="h-6 w-full" />
      <div className="mt-4">
        <Skeleton className="h-3.5 w-24" />
        {["w-40", "w-32", "w-44"].map(width => (
          <div
            key={width}
            className="flex min-h-12 items-center gap-2.5 border-b border-border py-2"
          >
            <Skeleton className="size-[9px] flex-none rounded-full" />
            <Skeleton className={`h-3.5 ${width}`} />
            <Skeleton className="ml-auto h-3.5 w-14" />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Skeleton className="h-3.5 w-28" />
        {["w-36", "w-48"].map(width => (
          <div
            key={width}
            className="flex min-h-12 items-center gap-2.5 border-b border-border py-2"
          >
            <Skeleton className="size-[9px] flex-none rounded-full" />
            <Skeleton className={`h-3.5 ${width}`} />
            <Skeleton className="ml-auto h-3.5 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
  // #endregion

  // #region HANDLERS
  const onRetry = () => {
    if (userId !== null) dispatchSnapshot({ params: {} });
  };

  // No amount: the action defaults the row to stocked (the table's XOR).
  const onSelectFood = (food: { id: string }) => {
    upsert({ food_id: food.id });
  };

  const onAskChef = () => {
    router.push("/chef");
  };

  const onOpenItem = (foodId: string) => {
    setOpenFoodId(foodId);
  };

  const onCloseItem = () => {
    setOpenFoodId(null);
  };
  // #endregion

  // #region LIFECYCLE
  // A null id scopes nothing: no fetch runs until the session resolves.
  useEffect(() => {
    if (userId === null) return;
    dispatchSnapshot({ params: {} });
  }, [userId, dispatchSnapshot]);

  useEffect(() => {
    dispatchCategories({ params: {} });
  }, [dispatchCategories]);
  // #endregion

  // #region VIEW
  return (
    <div className="pb-6">
      <header className="flex items-start justify-between gap-3 px-5 pt-1.5 pb-2.5">
        <div>
          <h2 className="font-display text-screen font-semibold">Pantry</h2>
          <span className="mt-1 block font-mono text-meta tabular-nums text-muted-foreground">
            {views.itemCount} items
          </span>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="grid size-11 flex-none place-items-center rounded-full border border-strong bg-surface"
        >
          <Settings
            aria-hidden="true"
            className="size-[18px]"
            strokeWidth={1.7}
          />
        </Link>
      </header>

      {viewState === "error" ? (
        <section className="px-5 pt-5">
          <div
            role="alert"
            className="rounded-card border border-strong bg-surface px-4.5 py-5 text-center"
          >
            <h3 className="font-display text-[20px] font-semibold">
              Couldn&rsquo;t load your pantry.
            </h3>
            <p className="mt-2 text-[14px] text-muted-foreground">
              {errorMessage ?? "The read didn’t finish."}
            </p>
            <Button className="mt-4 w-full" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </section>
      ) : viewState === "loading" ? (
        renderPantrySkeleton()
      ) : (
        <>
          <section className="px-5 pt-1">
            <div className="mb-1.5 font-mono text-micro tracking-[0.08em] text-muted-foreground uppercase">
              Quick add
            </div>
            <QuickAdd
              onSelect={onSelectFood}
              autoFocus={isFirstRun}
              createOnMissNote="saved to your pantry only"
            />
          </section>

          {isFirstRun ? (
            <section className="px-5 pt-4">
              <EmptyState
                headline="Start with what you have."
                explanation="Nothing here yet. Add a few things you already have — the chef works with what's here."
                action={
                  <p className="m-0 text-[12.5px] text-muted-foreground">
                    {isAdding ? "Adding…" : "Type a name above to add it."}
                  </p>
                }
              />
            </section>
          ) : (
            <>
              <section className="px-5 pt-3.5">
                <AskChefCard onAsk={onAskChef} />
              </section>

              {views.categories.map(category => (
                <section
                  key={category.id ?? category.name}
                  className="px-5 pt-4"
                >
                  <CategoryHeader
                    name={category.name}
                    count={category.items.length}
                  />
                  {category.items.map(item => (
                    <ItemRow
                      key={item.foodId}
                      name={item.name}
                      amount={item.amount}
                      state={item.state}
                      onClick={() => onOpenItem(item.foodId)}
                    />
                  ))}
                </section>
              ))}

              <section className="px-5 pt-5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-display text-[17px] font-semibold tracking-[-0.012em]">
                      Shopping list
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      From your own records. Nothing is predicted.
                    </p>
                  </div>
                  <Link
                    href="/shopping-list"
                    aria-label="Open the shopping list"
                    className="grid size-11 flex-none place-items-center rounded-full border border-strong bg-surface"
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className="size-[18px]"
                      strokeWidth={1.7}
                    />
                  </Link>
                </div>
                <div className="mt-1">
                  {views.list.length === 0 ? (
                    <p className="py-3 text-[12.5px] text-muted-foreground">
                      Nothing on the list yet.
                    </p>
                  ) : (
                    views.list.map(row => (
                      <ShoppingListRow
                        key={row.foodId}
                        name={row.name}
                        fact={row.fact}
                        stored={row.stored}
                      />
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </>
      )}

      {openItem ? (
        <ItemSheet
          key={openItem.food_id}
          item={openItem}
          onClose={onCloseItem}
        />
      ) : null}
    </div>
  );
  // #endregion
};
