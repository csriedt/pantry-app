"use client";

import { useState } from "react";

import { BookRow } from "@/components/composites/book-row";
import { EmptyState } from "@/components/composites/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// #region TYPES
export type RecipeBookState = "populated" | "empty" | "lookup";
type BookView = "your-pantry" | "popular" | "made";

interface RecipeBookScreenProperties {
  state: RecipeBookState;
}
// #endregion

// Placeholder fixtures — the real sampling lands with the signal wiring.
const FEASIBLE = [
  { title: "Onion rice", facts: "Rice · Onion · Garlic" },
  { title: "Garlic spaghetti", facts: "Spaghetti · Garlic · Olive oil" },
  { title: "Balsamic onions", facts: "Onion · Balsamic vinegar" },
  { title: "Rice with garlic", facts: "Rice · Garlic · Olive oil" },
  { title: "Onion spaghetti", facts: "Spaghetti · Onion" },
  { title: "Garlic rice", facts: "Rice · Garlic" },
];

const NEARLY_THERE = [
  { title: "Cumin rice", missing: ["Cumin"] },
  { title: "Egg fried rice", missing: ["Eggs"] },
];

const POPULAR = [
  { title: "Onion rice", facts: "made by 34 pantries · 12 made it again" },
  { title: "Garlic spaghetti", facts: "made by 41 pantries · 18 made it again" },
  { title: "Balsamic onions", facts: "made by 27 pantries · 9 made it again" },
  { title: "Rice with garlic", facts: "made by 23 pantries · 7 made it again" },
];

const MADE_MEALS = [
  { title: "Onion rice", made: "Made Tuesday", repeated: true },
  { title: "Garlic spaghetti", made: "Made 22 Sep", repeated: false },
  { title: "Rice with garlic", made: "Made 22 Sep", repeated: false },
];

const EMPTY_COPY: Record<BookView, { headline: string; action?: boolean }> = {
  "your-pantry": {
    headline: "Nothing in the book fits your pantry yet.",
    action: true,
  },
  popular: { headline: "Nothing proven yet — the book grows as pantries cook." },
  made: { headline: "No meals yet. When you tap Made it, it lands here." },
};

export const RecipeBookScreen = (props: RecipeBookScreenProperties) => {
  // #region CONSTANTS
  const { state } = props;
  // #endregion

  // #region HOOKS
  const [view, setView] = useState<BookView>("your-pantry");
  // #endregion

  // #region HANDLERS
  const onViewChange = (value: unknown) => {
    setView(value as BookView);
  };
  // #endregion

  // #region VIEW
  if (state === "lookup") {
    return (
      <div className="pb-6">
        <header className="px-5 pt-1">
          <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em]">
            Recipe book
          </h2>
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="font-mono text-[11.5px] text-muted-foreground">
              24 ideas
            </span>
            <button
              type="button"
              className="ml-auto min-h-11 rounded-pill border border-strong bg-surface px-3.5 text-[13px] font-semibold"
            >
              Shuffle
            </button>
          </div>
        </header>
        <div className="px-4 pt-3.5">
          <div
            role="status"
            className="rounded-control border border-strong bg-chip px-3.5 py-3 text-[12.5px] leading-snug"
          >
            The recipe book is open — free, no AI. Today&rsquo;s chef budget is
            used. Resets tomorrow.
          </div>
        </div>
        <div className="px-5 pt-3">
          {FEASIBLE.map(row => (
            <BookRow
              key={row.title}
              title={row.title}
              facts={row.facts}
              provenance="from the book"
            />
          ))}
        </div>
      </div>
    );
  }

  const empty = EMPTY_COPY[view];

  return (
    <div className="pb-6">
      <header className="px-5 pt-1">
        <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em]">
          Recipe book
        </h2>
        <div className="mt-1.5 flex items-center gap-2.5">
          <span className="font-mono text-[11.5px] text-muted-foreground">
            24 ideas
          </span>
          <button
            type="button"
            className="ml-auto min-h-11 rounded-pill border border-strong bg-surface px-3.5 text-[13px] font-semibold"
          >
            Shuffle
          </button>
        </div>
      </header>

      <Tabs value={view} onValueChange={onViewChange} className="gap-0">
        <TabsList className="mx-5 mt-3.5 grid w-auto grid-cols-3">
          <TabsTrigger value="your-pantry" className="h-11">
            Your pantry
          </TabsTrigger>
          <TabsTrigger value="popular" className="h-11">
            Popular
          </TabsTrigger>
          <TabsTrigger value="made" className="h-11">
            Made meals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="your-pantry">
          {state === "empty" ? (
            <div className="px-5 pt-6">
              <EmptyState
                headline={empty.headline}
                explanation=""
                align="center"
                action={
                  empty.action ? (
                    <Button variant="chef" className="w-full">
                      Ask the chef
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <div className="px-5 pt-3">
                {FEASIBLE.map(row => (
                  <BookRow key={row.title} title={row.title} facts={row.facts} />
                ))}
              </div>
              <div className="px-5 pt-4.5">
                <div className="mb-2 font-mono text-micro tracking-[0.09em] text-muted-foreground uppercase">
                  Nearly there
                </div>
                {NEARLY_THERE.map(row => (
                  <BookRow
                    key={row.title}
                    title={row.title}
                    missing={row.missing}
                    onAddToList={() => {}}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="popular">
          {state === "empty" ? (
            <div className="px-5 pt-6">
              <EmptyState
                headline={empty.headline}
                explanation=""
                align="center"
              />
            </div>
          ) : (
            <div className="px-5 pt-3">
              {POPULAR.map(row => (
                <BookRow key={row.title} title={row.title} facts={row.facts} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="made">
          {state === "empty" ? (
            <div className="px-5 pt-6">
              <EmptyState
                headline={empty.headline}
                explanation=""
                align="center"
              />
            </div>
          ) : (
            <div className="px-5 pt-3">
              {MADE_MEALS.map(row => (
                <div
                  key={row.title}
                  className="flex items-center gap-2.5 border-b border-border py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] break-words">{row.title}</div>
                    <div className="mt-0.5 font-mono text-[11px] font-semibold text-rust">
                      {row.made}
                    </div>
                  </div>
                  {row.repeated ? (
                    <span className="flex-none rounded-pill border border-strong px-1.5 py-0.5 font-mono text-[9px] tracking-[0.06em] text-muted-foreground uppercase">
                      made it again
                    </span>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-none rounded-xl px-3 text-[12.5px]"
                  >
                    Make it again
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
  // #endregion
};
