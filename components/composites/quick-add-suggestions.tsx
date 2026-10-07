import { Button } from "@/components/ui/button";

// #region TYPES
interface QuickAddSuggestionsProperties {
  suggestions: string[];
  createOnMiss?: string;
  onPick?: (value: string) => void;
  onCreate?: (value: string) => void;
}
// #endregion

export const QuickAddSuggestions = (
  props: QuickAddSuggestionsProperties
) => {
  // #region CONSTANTS
  const { suggestions, createOnMiss, onPick, onCreate } = props;
  // #endregion

  // #region VIEW
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map(suggestion => (
          <Button
            key={suggestion}
            variant="secondary"
            size="sm"
            className="rounded-pill px-3.5 font-normal"
            onClick={() => onPick?.(suggestion)}
          >
            {suggestion}
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
          Add &ldquo;{createOnMiss}&rdquo; — saved to your pantry only
        </Button>
      ) : null}
    </div>
  );
  // #endregion
};
