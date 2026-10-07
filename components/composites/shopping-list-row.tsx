import { Button } from "@/components/ui/button";

// #region TYPES
interface ShoppingListRowProperties {
  name: string;
  fact?: string;
  stored?: boolean;
  onHaveItAgain?: () => void;
}
// #endregion

export const ShoppingListRow = (props: ShoppingListRowProperties) => {
  // #region CONSTANTS
  const { name, fact, stored = false, onHaveItAgain } = props;
  // #endregion

  // #region VIEW
  return (
    <div className="flex min-h-[54px] flex-wrap items-center gap-2.5 border-b border-border py-2">
      <span className="font-medium">{name}</span>
      {stored ? (
        <span className="rounded-pill border border-strong px-2 py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-muted-foreground uppercase">
          added
        </span>
      ) : fact ? (
        <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {fact}
        </span>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        className="ml-auto rounded-xl bg-chip px-3 text-[13px]"
        onClick={onHaveItAgain}
      >
        I have it again
      </Button>
    </div>
  );
  // #endregion
};
