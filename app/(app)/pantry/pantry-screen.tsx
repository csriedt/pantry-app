"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Settings } from "lucide-react";

import { AskChefCard } from "@/components/composites/ask-chef-card";
import { CategoryHeader } from "@/components/composites/category-header";
import { EmptyState } from "@/components/composites/empty-state";
import { ItemRow } from "@/components/composites/item-row";
import { QuickAddSuggestions } from "@/components/composites/quick-add-suggestions";
import { ShoppingListRow } from "@/components/composites/shopping-list-row";
import type { StockState } from "@/components/composites/stock-glyph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// #region TYPES
export type PantryState =
  | "steady"
  | "first-run"
  | "loading"
  | "stale"
  | "error"
  | "edge";

interface PantryScreenProperties {
  state: PantryState;
}
// #endregion

// Placeholder fixtures — the real reads land with the service-flow wiring.
const CATEGORIES: {
  name: string;
  items: { name: string; amount?: string; state: StockState }[];
}[] = [
  {
    name: "Produce",
    items: [
      { name: "Onions", amount: "3", state: "stocked" },
      { name: "Garlic", amount: "1 head", state: "stocked" },
    ],
  },
  {
    name: "Dry goods",
    items: [
      { name: "Rice", amount: "500 g", state: "stocked" },
      { name: "Spaghetti", amount: "500 g", state: "stocked" },
      { name: "Flour", amount: "80 g", state: "short" },
    ],
  },
  {
    name: "Oils & vinegars",
    items: [
      { name: "Olive oil", state: "out" },
      { name: "Balsamic vinegar", amount: "250 ml", state: "stocked" },
    ],
  },
];

const EDGE_ITEM = {
  name: "Extra virgin cold-pressed olive oil from the market",
  amount: "1.5 L bottle",
  state: "stocked" as StockState,
};

const SHOPPING: { name: string; fact?: string; stored?: boolean }[] = [
  { name: "Olive oil", fact: "0 left · used 6× in 30 days" },
  { name: "Cumin", stored: true },
];

const SUGGESTIONS = ["Onions", "Rice", "Olive oil"];

export const PantryScreen = (props: PantryScreenProperties) => {
  // #region CONSTANTS
  const { state } = props;

  const isFirstRun = state === "first-run";
  const showSteady =
    state === "steady" || state === "stale" || state === "edge";

  const categories = CATEGORIES.map(category =>
    state === "edge" && category.name === "Oils & vinegars"
      ? { ...category, items: [...category.items, EDGE_ITEM] }
      : category
  );

  const itemCount = categories.reduce(
    (total, category) => total + category.items.length,
    0
  );
  // #endregion

  // #region HOOKS
  const router = useRouter();
  const [quickAdd, setQuickAdd] = useState("");
  const [openItem, setOpenItem] = useState<string | null>(null);
  // #endregion

  // #region HANDLERS
  const onQuickAdd = (event: ChangeEvent<HTMLInputElement>) => {
    setQuickAdd(event.target.value);
  };
  // #endregion

  // #region VIEW
  return (
    <div className="pb-6">
      <header className="flex items-start justify-between gap-3 px-5 pt-1.5 pb-2.5">
        <div>
          <h2 className="font-display text-screen font-semibold">Pantry</h2>
          <span className="mt-1 block font-mono text-meta tabular-nums text-muted-foreground">
            {itemCount} items
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

      {state === "stale" ? (
        <div className="px-5 pb-1">
          <span
            role="status"
            className="inline-flex items-center gap-2 rounded-pill border border-strong bg-chip px-3.5 py-2 text-[12.5px] text-muted-foreground"
          >
            Pantry changed — refreshing…
          </span>
        </div>
      ) : null}

      {state === "error" ? (
        <section className="px-5 pt-5">
          {/* Cause and last-updated are placeholder strings. */}
          <div
            role="alert"
            className="rounded-card border border-strong bg-surface px-4.5 py-5 text-center"
          >
            <h3 className="font-display text-[20px] font-semibold">
              Couldn&rsquo;t load your pantry.
            </h3>
            <p className="mt-2 text-[14px] text-muted-foreground">
              The read timed out before it finished.
            </p>
            <Button className="mt-4 w-full">Retry</Button>
            <p className="mt-3 font-mono text-[11.5px] text-muted-foreground">
              Last updated 2m ago
            </p>
          </div>
        </section>
      ) : state === "loading" ? (
        <section className="px-5 pt-3.5">
          <Skeleton className="h-6 w-full" />
          <div className="mt-4">
            <Skeleton className="h-3.5 w-24" />
            <div className="flex min-h-12 items-center gap-2.5 border-b border-border py-2">
              <Skeleton className="size-[9px] flex-none rounded-full" />
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="ml-auto h-3.5 w-14" />
            </div>
            <div className="flex min-h-12 items-center gap-2.5 border-b border-border py-2">
              <Skeleton className="size-[9px] flex-none rounded-full" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="ml-auto h-3.5 w-14" />
            </div>
            <div className="flex min-h-12 items-center gap-2.5 border-b border-border py-2">
              <Skeleton className="size-[9px] flex-none rounded-full" />
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="ml-auto h-3.5 w-14" />
            </div>
          </div>
          <div className="mt-4">
            <Skeleton className="h-3.5 w-28" />
            <div className="flex min-h-12 items-center gap-2.5 border-b border-border py-2">
              <Skeleton className="size-[9px] flex-none rounded-full" />
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="ml-auto h-3.5 w-16" />
            </div>
            <div className="flex min-h-12 items-center gap-2.5 border-b border-border py-2">
              <Skeleton className="size-[9px] flex-none rounded-full" />
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="ml-auto h-3.5 w-16" />
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="px-5 pt-1">
            <div className="mb-1.5 font-mono text-micro tracking-[0.08em] text-muted-foreground uppercase">
              Quick add
            </div>
            <Input
              value={quickAdd}
              onChange={onQuickAdd}
              placeholder="Add an item"
              autoFocus={isFirstRun}
            />
            {isFirstRun && quickAdd.trim().length > 0 ? (
              <div className="mt-3">
                <QuickAddSuggestions
                  suggestions={SUGGESTIONS}
                  createOnMiss={quickAdd.trim()}
                />
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">
                Names only — no amounts, no dates. Add those later if you want.
              </p>
            )}
          </section>

          {isFirstRun ? (
            <section className="px-5 pt-4">
              <EmptyState
                headline="Start with what you have."
                explanation="Nothing here yet. Add a few things you already have — the chef works with what's here."
                action={
                  <Button variant="secondary" className="w-full">
                    Add your first item
                  </Button>
                }
              />
            </section>
          ) : showSteady ? (
            <>
              <section className="px-5 pt-3.5">
                <AskChefCard onAsk={() => router.push("/chef")} />
              </section>

              {categories.map(category => (
                <section key={category.name} className="px-5 pt-4">
                  <CategoryHeader
                    name={category.name}
                    count={category.items.length}
                  />
                  {category.items.map(item => (
                    <ItemRow
                      key={item.name}
                      name={item.name}
                      amount={item.amount}
                      state={item.state}
                      onClick={() => setOpenItem(item.name)}
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
                  {SHOPPING.map(row => (
                    <ShoppingListRow
                      key={row.name}
                      name={row.name}
                      fact={row.fact}
                      stored={row.stored}
                    />
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </>
      )}

      <Sheet
        open={openItem !== null}
        onOpenChange={open => !open && setOpenItem(null)}
      >
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{openItem}</SheetTitle>
          </SheetHeader>
          <div className="px-5 pb-5">
            <Tabs defaultValue="stocked">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="stocked">stocked</TabsTrigger>
                <TabsTrigger value="short">short</TabsTrigger>
                <TabsTrigger value="out">out</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="mt-3.5 flex items-center justify-between border-y border-border py-2.5">
              <button
                type="button"
                aria-label="Less"
                className="size-12 rounded-xl border border-strong bg-surface text-[22px] leading-none"
              >
                −
              </button>
              <span className="font-mono text-[17px] font-semibold tabular-nums">
                500 g
              </span>
              <button
                type="button"
                aria-label="More"
                className="size-12 rounded-xl border border-strong bg-surface text-[22px] leading-none"
              >
                +
              </button>
            </div>
            <Button variant="secondary" className="mt-4 w-full">
              Remove
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
  // #endregion
};
