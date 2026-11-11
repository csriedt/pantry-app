import { Button } from "@/components/ui/button";

// #region TYPES
type IntentState = "pending" | "applied" | "declined";

interface IntentCardProperties {
  text: string;
  state?: IntentState;
  onApply?: () => void;
  onDecline?: () => void;
}
// #endregion

export const IntentCard = (props: IntentCardProperties) => {
  // #region CONSTANTS
  const { text, state = "pending", onApply, onDecline } = props;

  // Placeholder status copy — the final strings land with the design pass.
  const statusText = state === "applied" ? "Applied." : "Not now.";
  // #endregion

  // #region VIEW
  return (
    <div className="rounded-2xl border border-strong bg-surface p-3.5">
      <p className="m-0 text-[14.5px] leading-normal">{text}</p>
      {state === "pending" ? (
        <div className="mt-3.5 flex gap-2.5">
          <Button size="sm" className="flex-1" onClick={onApply}>
            Apply
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={onDecline}
          >
            Not now
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-small text-muted-foreground">{statusText}</p>
      )}
    </div>
  );
  // #endregion
};
