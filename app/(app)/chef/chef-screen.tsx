"use client";

import { ChefMessage } from "@/components/composites/chef-message";
import { EmptyState } from "@/components/composites/empty-state";
import { IntentCard } from "@/components/composites/intent-card";
import { QuickAddSuggestions } from "@/components/composites/quick-add-suggestions";
import { RecipeCard } from "@/components/composites/recipe-card";
import { Button } from "@/components/ui/button";

// #region TYPES
export type ChefState =
  | "conversation"
  | "empty"
  | "streaming"
  | "collision"
  | "lookup"
  | "intent"
  | "error";

interface ChefScreenProperties {
  state: ChefState;
}
// #endregion

// Placeholder prompts — §4.3 asks for three example chips; the copy lands
// with the chef wiring.
const EXAMPLE_PROMPTS = [
  "What can I make?",
  "Something quick",
  "Use up the rice",
];

export const ChefScreen = (props: ChefScreenProperties) => {
  // #region CONSTANTS
  const { state } = props;
  // #endregion

  // #region HELPERS
  const banner = (text: string) => (
    <div
      role="status"
      className="flex gap-2.5 rounded-control border border-strong bg-chip px-3.5 py-[11px] text-[12.5px] leading-snug"
    >
      {text}
    </div>
  );

  const errorCard = (
    <div role="alert" className="rounded-2xl border border-strong bg-surface p-4">
      <div className="text-[15px] font-semibold">Answer stopped.</div>
      <div className="mt-1 text-[13.5px] text-muted-foreground">
        The answer stopped partway. Retry — your input is still here.
      </div>
      <Button size="sm" className="mt-3.5 w-full">
        Retry
      </Button>
    </div>
  );
  // #endregion

  // #region VIEW
  return (
    <div className="flex min-h-[calc(100dvh-72px)] flex-col pb-2">
      <header className="flex items-center justify-between gap-3 px-5 pt-1 pb-2.5">
        <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em]">
          Chef
        </h2>
        <button
          type="button"
          aria-label="More options"
          className="grid size-11 place-items-center rounded-full border border-strong bg-surface"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-[18px]"
            fill="currentColor"
          >
            <circle cx="5" cy="12" r="1.4" />
            <circle cx="12" cy="12" r="1.4" />
            <circle cx="19" cy="12" r="1.4" />
          </svg>
        </button>
      </header>

      {state === "empty" ? (
        <div className="px-5 pt-6">
          <EmptyState
            headline="Ask the chef what you can make."
            explanation="Answers read your pantry as it is right now."
            action={<QuickAddSuggestions suggestions={EXAMPLE_PROMPTS} />}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3.5 px-5 pt-0.5">
          {state === "lookup" ? (
            banner(
              "The recipe book is open — free, no AI. Today's chef budget is used. Resets tomorrow."
            )
          ) : null}

          <ChefMessage role="me" text="What can I make?" />

          {state === "streaming" ? (
            <ChefMessage
              role="ai"
              text="Onion rice — you have"
              tools={["Read your pantry · v43"]}
              streaming
            />
          ) : state === "collision" ? (
            <>
              <ChefMessage
                role="ai"
                text="Onion rice — you have everything for it."
                tools={["Read your pantry · v44"]}
              />
              {banner("Pantry changed — refreshing…")}
            </>
          ) : state === "lookup" ? (
            <>
              <ChefMessage
                role="ai"
                text="Onion rice."
                tools={["from the book"]}
              />
              <RecipeCard
                title="Onion rice"
                items={["Rice", "Onion", "Garlic", "Olive oil"]}
                state="collapsed"
              />
            </>
          ) : state === "intent" ? (
            <>
              <ChefMessage
                role="ai"
                text="Onion rice — you have everything for it."
                tools={["Read your pantry · v43"]}
                note="AI can make mistakes — check anything that matters."
              />
              <IntentCard text="The chef wants to deduct 300 g of Rice. Apply it?" />
            </>
          ) : state === "error" ? (
            <>
              <ChefMessage
                role="ai"
                text="Onion rice — you have"
                tools={["Read your pantry · v43"]}
              />
              {errorCard}
            </>
          ) : (
            <>
              <ChefMessage
                role="ai"
                text="Onion rice — you have everything for it."
                tools={["Read your pantry · v43"]}
                note="AI can make mistakes — check anything that matters."
              />
              <RecipeCard
                title="Onion rice"
                items={["Rice", "Onion", "Garlic", "Olive oil"]}
                state="collapsed"
              />
            </>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2.5 border-t border-border bg-surface px-4 pt-2.5 pb-1.5">
        <input
          className="h-11 min-w-0 flex-1 rounded-pill border border-strong bg-background px-3.5 text-[14.5px] outline-none placeholder:text-muted-foreground focus-visible:border-ink"
          placeholder="Ask the chef"
        />
        <button
          type="button"
          aria-label="Send"
          className="grid size-11 flex-none place-items-center rounded-full border border-ink bg-ink text-canvas"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path d="M12 19V5" />
            <path d="M6 11l6-6 6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
  // #endregion
};
