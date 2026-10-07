import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { StockGlyph, type StockState } from "./stock-glyph";

// #region TYPES
interface ItemRowProperties {
  name: string;
  amount?: string;
  state: StockState;
  highlighted?: boolean;
  onClick?: () => void;
}
// #endregion

export const ItemRow = (props: ItemRowProperties) => {
  // #region CONSTANTS
  const { name, amount, state, highlighted = false, onClick } = props;

  const rowClass = cn(
    "flex min-h-12 w-full items-center gap-2.5 border-b border-border py-2",
    highlighted && "bg-chip"
  );
  // #endregion

  // #region HELPERS
  const content = (
    <>
      <StockGlyph state={state} />
      <span className="min-w-0 flex-1 break-words">{name}</span>
      {amount ? (
        <span className="flex-none font-mono text-small tabular-nums text-muted-foreground">
          {amount}
        </span>
      ) : null}
      {state === "short" ? <Badge variant="short">short</Badge> : null}
      {state === "out" ? <Badge variant="out">out</Badge> : null}
    </>
  );
  // #endregion

  // #region VIEW
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(rowClass, "text-left")}
      >
        {content}
      </button>
    );
  }

  return <div className={rowClass}>{content}</div>;
  // #endregion
};
