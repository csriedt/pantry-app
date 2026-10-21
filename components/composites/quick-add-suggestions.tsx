import { Button } from "@/components/ui/button";

import type { Food } from "@/types/catalog/food";

// #region TYPES
interface QuickAddSuggestionsProperties {
  /** The matches for the typed prefix, own rows first. */
  suggestions: Food[];
  /** The typed name when nothing matched exactly — the create-on-miss row. */
  createOnMiss?: string;
  /** Where a created row lands, e.g. "saved to your pantry only". */
  createOnMissNote?: string;
  /** True while the type-ahead read is in flight. */
  searching?: boolean;
  onPick?: (food: Food) => void;
  onCreate?: (name: string) => void;
}
// #endregion

export const QuickAddSuggestions = (
  props: QuickAddSuggestionsProperties
) => {
  // #region CONSTANTS
  const {
    suggestions,
    createOnMiss,
    createOnMissNote = "saved to your pantry only",
    searching = false,
    onPick,
    onCreate,
  } = props;
  // #endregion

  // #region VIEW
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map(suggestion => (
          <Button
            key={suggestion.id}
            variant="secondary"
            size="sm"
            className="rounded-pill px-3.5 font-normal"
            onClick={() => onPick?.(suggestion)}
          >
            {suggestion.canonical_name}
          </Button>
        ))}
      </div>
      {createOnMiss ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 h-auto w-full justify-start gap-2.5 px-3.5 py-3.5 text-[14.5px] font-normal"
          onClick={() => onCreate?.(createOnMiss)}
        >
          <span className="font-mono text-muted-foreground">+</span>
          Add &ldquo;{createOnMiss}&rdquo; — {createOnMissNote}
        </Button>
      ) : null}
      {searching && suggestions.length === 0 && !createOnMiss ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Looking through the catalog…
        </p>
      ) : null}
    </div>
  );
  // #endregion
}
