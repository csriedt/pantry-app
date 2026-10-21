"use client";

import { ChefMessage } from "@/components/composites/chef-message";
import { RecipeCard } from "@/components/composites/recipe-card";

export const ChefScreen = () => {
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

      <div className="flex flex-1 flex-col gap-3.5 px-5 pt-0.5">
        <ChefMessage role="me" text="What can I make?" />
        <ChefMessage
          role="ai"
          text="Onion rice — you have everything for it."
          tools={["Read your pantry"]}
          note="AI can make mistakes — check anything that matters."
        />
        <RecipeCard
          title="Onion rice"
          items={["Rice", "Onion", "Garlic", "Olive oil"]}
          state="collapsed"
        />
      </div>

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
