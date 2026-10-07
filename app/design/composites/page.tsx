"use client";

import type { ReactNode } from "react";
import { useTheme } from "next-themes";

import { AskChefCard } from "@/components/composites/ask-chef-card";
import { BookRow } from "@/components/composites/book-row";
import { BottomNav } from "@/components/composites/bottom-nav";
import { CategoryHeader } from "@/components/composites/category-header";
import { ChefMessage } from "@/components/composites/chef-message";
import { EmptyState } from "@/components/composites/empty-state";
import { GraceBanner } from "@/components/composites/grace-banner";
import { IntentCard } from "@/components/composites/intent-card";
import { ItemRow } from "@/components/composites/item-row";
import { MadeDateLine } from "@/components/composites/made-date-line";
import { QuickAddSuggestions } from "@/components/composites/quick-add-suggestions";
import { RecipeCard } from "@/components/composites/recipe-card";
import { ShoppingListRow } from "@/components/composites/shopping-list-row";
import { TypeToConfirm } from "@/components/composites/type-to-confirm";
import { Button } from "@/components/ui/button";

const NOW = new Date("2026-10-06T12:00:00Z");
const MADE_RECENT = new Date("2026-10-03T12:00:00Z"); // 3 days — weekday form
const MADE_OLD = new Date("2026-09-14T12:00:00Z"); // older — date form

const CARD_ITEMS = ["Rice", "Onion", "Garlic", "Olive oil"];
const CARD_USED = [
  { name: "Rice", math: "500 g → 200 g" },
  { name: "Onion", math: "3 → 2" },
];
const CARD_SKIPPED = [
  { name: "Olive oil", reason: "No unit match — counts stay as they are" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-micro tracking-micro text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Composites gallery — every custom composite in its states, light and dark.
 * Companion to /design (the shadcn primitives). View in the browser's mobile
 * mode for the 390px board comparison.
 */
export default function CompositesPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <main className="flex w-full flex-col gap-8 p-5 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-title font-semibold">Composites</h1>
        <Button variant="secondary" size="sm" onClick={toggleTheme}>
          {isDark ? "Light" : "Dark"}
        </Button>
      </header>

      <Section title="Category header + item rows">
        <CategoryHeader name="Dry goods" count={3} />
        <ItemRow name="Rice" amount="500 g" state="stocked" />
        <ItemRow name="Spaghetti" amount="500 g" state="stocked" />
        <ItemRow name="Flour" amount="80 g" state="short" />
        <ItemRow name="Olive oil" state="out" />
        <ItemRow name="Cumin" amount="1 jar" state="stocked" highlighted />
      </Section>

      <Section title="Shopping list">
        <ShoppingListRow name="Olive oil" fact="0 left · used 6× in 30 days" />
        <ShoppingListRow name="Cumin" stored />
      </Section>

      <Section title="Bottom nav">
        <div className="overflow-hidden rounded-card border border-border">
          <BottomNav active="pantry" />
        </div>
        <div className="overflow-hidden rounded-card border border-border">
          <BottomNav active="recipe-book" />
        </div>
      </Section>

      <Section title="Chef messages">
        <div className="flex flex-col gap-3.5">
          <ChefMessage role="me" text="What can I make?" />
          <ChefMessage
            role="ai"
            text="Onion rice — you have everything for it."
            tools={["Read your pantry · v43"]}
            note="AI can make mistakes — check anything that matters."
          />
          <ChefMessage role="ai" text="Thinking about what fits" streaming />
        </div>
      </Section>

      <Section title="Intent card">
        <IntentCard text="The chef wants to deduct 300 g of Rice. Apply it?" />
        <IntentCard
          text="The chef wants to deduct 300 g of Rice. Apply it?"
          state="applied"
        />
      </Section>

      <Section title="Recipe card">
        <RecipeCard
          title="Onion rice"
          items={CARD_ITEMS}
          state="collapsed"
        />
        <RecipeCard
          title="Onion rice"
          items={CARD_ITEMS}
          state="preview"
          used={CARD_USED}
          skipped={CARD_SKIPPED}
        />
        <RecipeCard
          title="Onion rice"
          items={CARD_ITEMS}
          state="receipt"
          used={CARD_USED}
          skipped={CARD_SKIPPED}
          madeAt={MADE_RECENT}
          now={NOW}
        />
        <RecipeCard
          title="Onion rice"
          items={CARD_ITEMS}
          state="undone"
          used={CARD_USED}
          skipped={CARD_SKIPPED}
          madeAt={MADE_RECENT}
          now={NOW}
        />
      </Section>

      <Section title="Made date">
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">
            <MadeDateLine madeAt={MADE_RECENT} now={NOW} />
          </div>
          <div className="flex justify-end">
            <MadeDateLine madeAt={MADE_OLD} now={NOW} />
          </div>
        </div>
      </Section>

      <Section title="Book rows">
        <div>
          <BookRow title="Onion rice" facts="Rice · Onion · Garlic" />
          <BookRow
            title="Cumin rice"
            missing={["Cumin"]}
            onAddToList={() => {}}
          />
          <BookRow
            title="Garlic spaghetti"
            facts="Spaghetti · Garlic · Olive oil"
            added
          />
        </div>
      </Section>

      <Section title="Quick add">
        <QuickAddSuggestions
          suggestions={["Onions", "Rice", "Olive oil"]}
          createOnMiss="Cumin"
        />
      </Section>

      <Section title="Empty state">
        <EmptyState
          headline="Start with what you have."
          explanation="Add a few things you keep around. Names only — amounts come later."
          action={
            <Button variant="chef" className="w-full">
              Ask the chef
            </Button>
          }
        />
      </Section>

      <Section title="Grace banner">
        <GraceBanner
          text="Account deletion is scheduled. Your data is purged after 7 days."
          actionLabel="Cancel deletion"
        />
      </Section>

      <Section title="Type to confirm">
        <TypeToConfirm
          label="Type DELETE to confirm"
          word="DELETE"
          actionLabel="Delete account"
        />
      </Section>

      <Section title="Ask the chef card">
        <AskChefCard />
      </Section>
    </main>
  );
}
