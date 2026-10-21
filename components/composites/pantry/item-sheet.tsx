"use client";

import { useRemovePantryItem } from "@/hooks/pantry/useRemovePantryItem";
import { useUpsertPantryItem } from "@/hooks/pantry/useUpsertPantryItem";
import { useSessionUserId } from "@/components/providers/session-user-provider";
import { formatAmount } from "@/lib/pantry-view";
import type { PantryItem } from "@/types/pantry/pantryItem";
import type { StockState } from "@/types/pantry/stockState";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// #region TYPES
interface ItemSheetProperties {
  item: PantryItem;
  onClose: () => void;
}
// #endregion

// #region CONSTANTS
const STOCK_STATES: StockState[] = ["stocked", "short", "out"];
// #endregion

/**
 * Counted rows offer the stepper, level rows the tabs — the table's XOR means
 * a write sets one mode, never both.
 */
export const ItemSheet = (props: ItemSheetProperties) => {
  // #region CONSTANTS
  const { item, onClose } = props;

  const counted = item.amount !== null;
  const amountText = formatAmount(item.amount, item.unit);
  const levelTab = counted ? "" : (item.stock_state ?? "stocked");
  // #endregion

  // #region HOOKS
  const userId = useSessionUserId();
  const [upsert, , isUpserting] = useUpsertPantryItem(userId);
  const [remove, , isRemoving] = useRemovePantryItem(userId);
  // #endregion

  // #region HANDLERS
  const onStep = (delta: number) => {
    const base = item.amount ?? 0;
    // A first step from a level row starts the count at one.
    const next = base === 0 ? Math.max(0, delta) : Math.max(0, base + delta);
    if (next === base) return;

    upsert({
      food_id: item.food_id,
      amount: next,
      unit: item.unit ?? null,
    });
  };

  const onLevelChange = (value: unknown) => {
    const state = value as StockState;
    if (!STOCK_STATES.includes(state) || state === item.stock_state) return;

    upsert({ food_id: item.food_id, stock_state: state });
  };

  const onRemove = () => {
    remove(
      { food_id: item.food_id },
      { onSuccess: () => onClose() },
    );
  };
  // #endregion

  // #region VIEW
  return (
    <Sheet
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{item.canonical_name}</SheetTitle>
        </SheetHeader>
        <div className="px-5 pb-5">
          <Tabs value={levelTab} onValueChange={onLevelChange}>
            <TabsList className="grid w-full grid-cols-3">
              {STOCK_STATES.map(state => (
                <TabsTrigger key={state} value={state}>
                  {state}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="mt-3.5 flex items-center justify-between border-y border-border py-2.5">
            <button
              type="button"
              aria-label="Less"
              className="size-12 rounded-xl border border-strong bg-surface text-[22px] leading-none disabled:opacity-50"
              onClick={() => onStep(-1)}
              disabled={counted && (item.amount ?? 0) <= 0}
            >
              −
            </button>
            <span className="font-mono text-[17px] font-semibold tabular-nums">
              {counted ? amountText : "no count"}
            </span>
            <button
              type="button"
              aria-label="More"
              className="size-12 rounded-xl border border-strong bg-surface text-[22px] leading-none"
              onClick={() => onStep(1)}
            >
              +
            </button>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            An amount or a level — whichever you set last is what it keeps.
            {isUpserting ? " Saving…" : ""}
          </p>
          <Button
            variant="secondary"
            className="mt-4 w-full"
            onClick={onRemove}
            disabled={isRemoving}
          >
            {isRemoving ? "Removing…" : "Remove"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
  // #endregion
}
