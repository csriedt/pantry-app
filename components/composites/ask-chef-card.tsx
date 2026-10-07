import { Button } from "@/components/ui/button";

// #region TYPES
interface AskChefCardProperties {
  onAsk?: () => void;
}
// #endregion

export const AskChefCard = (props: AskChefCardProperties) => {
  // #region CONSTANTS
  const { onAsk } = props;
  // #endregion

  // #region VIEW
  return (
    <div className="rounded-card border border-strong bg-surface p-4">
      <div className="font-display text-title font-semibold">
        What can I make?
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Answers read your pantry as it is right now.
      </p>
      <Button variant="chef" className="mt-3.5 w-full" onClick={onAsk}>
        Ask the chef
      </Button>
      <p className="mt-2.5 text-[11.5px] text-muted-foreground">
        AI can make mistakes — check anything that matters.
      </p>
    </div>
  );
  // #endregion
};
