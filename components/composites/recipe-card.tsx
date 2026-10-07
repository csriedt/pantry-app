import { Button } from "@/components/ui/button";

import { MadeDateLine } from "./made-date-line";

// #region TYPES
type RecipeCardState = "collapsed" | "preview" | "receipt" | "undone";

interface RecipeLine {
  name: string;
  /** The math for a used line, e.g. "500 g → 200 g". */
  math?: string;
  /** The reason a line was skipped. */
  reason?: string;
}

interface RecipeCardProperties {
  title: string;
  items: string[];
  state?: RecipeCardState;
  used?: RecipeLine[];
  skipped?: RecipeLine[];
  madeAt?: Date;
  now?: Date;
  onCommit?: () => void;
  onToggle?: () => void;
  onUndo?: () => void;
}
// #endregion

export const RecipeCard = (props: RecipeCardProperties) => {
  // #region CONSTANTS
  const {
    title,
    items,
    state = "collapsed",
    used = [],
    skipped = [],
    madeAt,
    now,
    onCommit,
    onToggle,
    onUndo,
  } = props;

  const expanded = state !== "collapsed";
  const showCommit = state === "collapsed" || state === "preview";
  const usedHeading = state === "preview" ? "Will use" : "Used";
  const skippedHeading = state === "preview" ? "Can't deduct" : "Skipped";
  // #endregion

  // #region VIEW
  return (
    <div className="rounded-2xl border border-strong bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2.5">
        <span className="min-w-0 flex-1 font-display text-recipe font-semibold">
          {title}
        </span>
        {madeAt && now && !showCommit ? (
          <MadeDateLine madeAt={madeAt} now={now} />
        ) : null}
        {showCommit ? (
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={onToggle}
            className="grid size-8 flex-none place-items-center rounded-full border border-strong"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-[15px]"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
            >
              {expanded ? (
                <path d="M6 15l6-6 6 6" />
              ) : (
                <path d="M6 9l6 6 6-6" />
              )}
            </svg>
          </button>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {items.map(item => (
          <span
            key={item}
            className="rounded-pill border border-strong px-2 py-[3px] text-[10.5px] text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </div>

      {state === "undone" ? (
        <p role="status" className="mt-0.5 text-[12px] text-ink">
          Undone — amounts restored
        </p>
      ) : null}

      {expanded && used.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            {usedHeading}
          </div>
          {used.map(line => (
            <div
              key={line.name}
              className="flex items-baseline justify-between gap-3 border-b border-dashed border-border py-[5px] text-small last:border-b-0"
            >
              <span>{line.name}</span>
              <span className="flex-none font-mono text-[11.5px] tabular-nums">
                {line.math}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {expanded && skipped.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            {skippedHeading}
          </div>
          {skipped.map(line => (
            <div
              key={line.name}
              className="flex items-baseline justify-between gap-3 border-b border-dashed border-border py-[5px] text-small last:border-b-0"
            >
              <span>{line.name}</span>
              <span className="max-w-[60%] text-right text-[11px] text-muted-foreground">
                {line.reason}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {state === "preview" ? (
        <p className="mt-2.5 text-[10.5px] leading-snug text-muted-foreground">
          Deductions apply when you tap Made it. Nothing is consumed yet.
        </p>
      ) : null}

      {showCommit ? (
        <Button
          variant="commit"
          className="mt-3 h-11 w-full"
          onClick={onCommit}
        >
          Made it
        </Button>
      ) : null}

      {state === "receipt" ? (
        <>
          <div className="my-3 border-t border-dashed border-strong" />
          <div className="flex items-center justify-between gap-2.5 text-[11px] text-muted-foreground">
            <span>Logged to your meals. Undo restores the amounts.</span>
            <button
              type="button"
              onClick={onUndo}
              className="min-h-11 px-1 text-[11px] font-semibold text-ink underline underline-offset-2"
            >
              Undo
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
  // #endregion
};
