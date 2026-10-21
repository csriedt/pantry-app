"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BookRow } from "@/components/composites/book-row";
import { EmptyState } from "@/components/composites/empty-state";
import { MadeDateLine } from "@/components/composites/made-date-line";
import { useSessionUserId } from "@/components/providers/session-user-provider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommitMeal } from "@/hooks/meals/useCommitMeal";
import { useListMeals } from "@/hooks/meals/useListMeals";
import { useGetRecipeBook } from "@/hooks/recipeBook/useGetRecipeBook";
import { newSeed, sampleSeeded } from "@/lib/sample";
import type { RecipeBookEntry } from "@/types/recipeBook/recipeBookEntry";

// #region TYPES
type BookView = "your-pantry" | "popular" | "made";
// #endregion

// #region CONSTANTS
const FEASIBLE_SAMPLE = 6;
const NEARLY_SAMPLE = 2;
const POPULAR_SAMPLE = 6;
const MADE_LIMIT = 20;

const EMPTY_COPY: Record<BookView, { headline: string; action?: boolean }> = {
  "your-pantry": {
    headline: "Nothing in the book fits your pantry yet.",
    action: true,
  },
  popular: { headline: "Nothing proven yet — the book grows as pantries cook." },
  made: { headline: "No meals yet. When you tap Made it, it lands here." },
};
// #endregion

// #region HELPERS
const popularFacts = (
  signal: RecipeBookEntry["signal"],
): string | undefined => {
  if (!signal || signal.kitchens === null) return undefined;
  const again =
    signal.repeat_kitchens === null
      ? ""
      : ` · ${signal.repeat_kitchens} made it again`;
  return `made by ${signal.kitchens} pantries${again}`;
};
// #endregion

export const RecipeBookScreen = () => {
  // #region HOOKS
  const router = useRouter();
  const userId = useSessionUserId();
  const [view, setView] = useState<BookView>("your-pantry");
  const [seed, setSeed] = useState(newSeed);
  const [now] = useState(() => new Date());
  const [corpusQuery, dispatchCorpus] = useGetRecipeBook();
  const [popularQuery, dispatchPopular] = useGetRecipeBook();
  const [mealsQuery, dispatchMeals] = useListMeals(userId);
  const [commitMeal, , isCommitting] = useCommitMeal(userId);
  // #endregion

  // #region CONSTANTS
  const entries = corpusQuery.data?.data?.entries ?? [];
  const feasible = entries.filter(entry => entry.feasible);
  const gaps = entries.filter(entry => !entry.feasible);

  const popularEntries =
    popularQuery.data?.data?.entries ?? entries.filter(e => e.signal !== null);

  const meals = (mealsQuery.data?.data?.meals ?? []).filter(
    meal => meal.undone_at === null,
  );
  const titles = new Map(entries.map(entry => [entry.recipe_id, entry.title]));
  const repeats = new Map<string, number>();
  for (const meal of meals) {
    repeats.set(meal.recipe_id, (repeats.get(meal.recipe_id) ?? 0) + 1);
  }

  const baseLoaded =
    userId !== null && !corpusQuery.isPending && !mealsQuery.isPending;
  const popularLoaded = baseLoaded && !popularQuery.isPending;

  const empty = EMPTY_COPY[view];
  const errorMessage =
    corpusQuery.error?.message ??
    popularQuery.error?.message ??
    mealsQuery.error?.message;
  // #endregion

  // #region HELPERS
  const isEmpty = (rows: readonly unknown[]) =>
    baseLoaded && rows.length === 0;
  // #endregion

  // #region HANDLERS
  const onViewChange = (value: unknown) => {
    setView(value as BookView);
  };

  const onShuffle = () => {
    setSeed(newSeed());
  };

  const onMakeItAgain = (recipeId: string) => {
    commitMeal({ recipe_id: recipeId });
  };
  // #endregion

  // #region LIFECYCLE
  useEffect(() => {
    if (userId === null) return;
    dispatchCorpus({ params: { view: "your-pantry" } });
    dispatchMeals({ params: { limit: MADE_LIMIT } });
  }, [userId, dispatchCorpus, dispatchMeals]);

  useEffect(() => {
    if (userId === null || view !== "popular") return;
    dispatchPopular({ params: { view: "popular" } });
  }, [userId, view, dispatchPopular]);
  // #endregion

  // #region VIEW
  const shuffleButton = (
    <button
      type="button"
      onClick={onShuffle}
      className="ml-auto min-h-11 rounded-pill border border-strong bg-surface px-3.5 text-[13px] font-semibold"
    >
      Shuffle
    </button>
  );

  const header = (
    <header className="px-5 pt-1">
      <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em]">
        Recipe book
      </h2>
      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {feasible.length} ideas
        </span>
        {shuffleButton}
      </div>
    </header>
  );

  const pending = (
    <p className="mx-5 mt-5 text-[13px] text-muted-foreground">
      Reading the book…
    </p>
  );

  return (
    <div className="pb-6">
      {header}

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
          {baseLoaded ? (
            isEmpty(feasible) ? (
              <div className="px-5 pt-6">
                <EmptyState
                  headline={empty.headline}
                  explanation=""
                  align="center"
                  action={
                    empty.action ? (
                      <Button
                        variant="chef"
                        className="w-full"
                        onClick={() => router.push("/chef")}
                      >
                        Ask the chef
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <>
                <div className="px-5 pt-3">
                  {sampleSeeded(feasible, FEASIBLE_SAMPLE, seed).map(entry => (
                    <BookRow
                      key={entry.recipe_id}
                      title={entry.title ?? "Untitled idea"}
                      facts={entry.items.join(" · ")}
                    />
                  ))}
                </div>
                <div className="px-5 pt-4.5">
                  <div className="mb-2 font-mono text-micro tracking-[0.09em] text-muted-foreground uppercase">
                    Nearly there
                  </div>
                  {sampleSeeded(gaps, NEARLY_SAMPLE, seed).map(entry => (
                    <BookRow
                      key={entry.recipe_id}
                      title={entry.title ?? "Untitled idea"}
                      missing={entry.missing}
                    />
                  ))}
                </div>
              </>
            )
          ) : (
            pending
          )}
        </TabsContent>

        <TabsContent value="popular">
          {popularLoaded ? (
            isEmpty(popularEntries) ? (
              <div className="px-5 pt-6">
                <EmptyState
                  headline={empty.headline}
                  explanation=""
                  align="center"
                />
              </div>
            ) : (
              <div className="px-5 pt-3">
                {sampleSeeded(popularEntries, POPULAR_SAMPLE, seed).map(entry => (
                  <BookRow
                    key={entry.recipe_id}
                    title={entry.title ?? "Untitled idea"}
                    facts={popularFacts(entry.signal)}
                  />
                ))}
              </div>
            )
          ) : (
            pending
          )}
        </TabsContent>

        <TabsContent value="made">
          {baseLoaded ? (
            meals.length === 0 ? (
              <div className="px-5 pt-6">
                <EmptyState
                  headline={empty.headline}
                  explanation=""
                  align="center"
                />
              </div>
            ) : (
              <div className="px-5 pt-3">
                {meals.map(meal => (
                  <div
                    key={meal.id}
                    className="flex items-center gap-2.5 border-b border-border py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] break-words">
                        {titles.get(meal.recipe_id) ?? "A meal"}
                      </div>
                    </div>
                    <MadeDateLine madeAt={new Date(meal.at)} now={now} />
                    {(repeats.get(meal.recipe_id) ?? 0) > 1 ? (
                      <span className="flex-none rounded-pill border border-strong px-1.5 py-0.5 font-mono text-[9px] tracking-[0.06em] text-muted-foreground uppercase">
                        made it again
                      </span>
                    ) : null}
                    <Button
                      variant="commit"
                      size="sm"
                      className="flex-none rounded-xl px-3 text-[12.5px]"
                      disabled={isCommitting}
                      onClick={() => onMakeItAgain(meal.recipe_id)}
                    >
                      Make it again
                    </Button>
                  </div>
                ))}
              </div>
            )
          ) : (
            pending
          )}
        </TabsContent>
      </Tabs>

      {errorMessage ? (
        <p role="alert" className="mx-5 mt-3 text-[12.5px] text-danger">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
  // #endregion
};
