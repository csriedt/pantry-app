import { Button } from "@/components/ui/button";

// #region TYPES
interface BookRowProperties {
  title: string;
  facts?: string;
  missing?: string[];
  added?: boolean;
  provenance?: string;
  onAddToList?: () => void;
}
// #endregion

export const BookRow = (props: BookRowProperties) => {
  // #region CONSTANTS
  const {
    title,
    facts,
    missing = [],
    added = false,
    provenance,
    onAddToList,
  } = props;

  const factLine =
    missing.length > 0 ? `Missing: ${missing.join(", ")}` : facts;
  // #endregion

  // #region VIEW
  return (
    <div className="flex min-h-[62px] items-center gap-3 border-b border-border py-2 first:border-t">
      <div className="min-w-0 flex-1">
        {provenance ? (
          <span className="mb-1.5 inline-block rounded-pill border border-strong px-1.5 py-0.5 font-mono text-[9px] tracking-[0.06em] text-muted-foreground uppercase">
            {provenance}
          </span>
        ) : null}
        <div className="font-display text-[16px] leading-tight font-semibold break-words">
          {title}
        </div>
        {factLine ? (
          <div className="mt-1 font-mono text-[11px] leading-snug break-words text-muted-foreground">
            {factLine}
          </div>
        ) : null}
      </div>
      {added ? (
        <span className="inline-flex min-h-11 flex-none items-center rounded-xl border border-strong bg-chip px-3 text-[12.5px] font-semibold text-muted-foreground">
          + added
        </span>
      ) : onAddToList ? (
        <Button
          size="sm"
          variant="secondary"
          className="flex-none rounded-xl px-3 text-[12.5px]"
          onClick={onAddToList}
        >
          + Add to list
        </Button>
      ) : null}
    </div>
  );
  // #endregion
};
