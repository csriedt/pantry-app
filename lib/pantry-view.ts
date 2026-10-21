import type { Category } from "@/types/catalog/category";
import type {
  DerivedListRow,
  GetPantrySnapshotResponse,
  StoredListRow,
} from "@/types/pantry/getPantrySnapshotResponse";
import type { PantryItem } from "@/types/pantry/pantryItem";
import type { StockState } from "@/types/pantry/stockState";

export const UNCATEGORIZED_LABEL = "Other";

export type PantryItemView = {
  foodId: string;
  name: string;
  amount?: string;
  state: StockState;
};

export type PantryCategoryView = {
  id: string | null;
  name: string;
  items: PantryItemView[];
};

export type ShoppingListRowView = {
  foodId: string;
  name: string;
  fact?: string;
  stored: boolean;
  source: string | null;
};

export const formatAmount = (
  amount: number | null | undefined,
  unit: string | null | undefined,
): string | undefined => {
  if (amount === null || amount === undefined) return undefined;
  return unit ? `${amount} ${unit}` : `${amount}`;
};

const REASON_LABEL: Record<DerivedListRow["reason"], string> = {
  out: "0 left",
  low: "low",
  declining: "declining",
};

const derivedFact = (row: DerivedListRow): string => {
  const counted = formatAmount(row.amount, row.unit);
  const left =
    row.reason === "out"
      ? REASON_LABEL.out
      : counted
        ? `${counted} left`
        : REASON_LABEL[row.reason];
  return `${left} · used ${row.used_28d}× in 28 days`;
};

// Ordered by the categories read; unknown ids share a trailing bucket.
export const groupPantryItems = (
  items: PantryItem[],
  categories: Category[],
): PantryCategoryView[] => {
  const buckets = new Map<string | null, PantryItemView[]>();
  for (const item of items) {
    const view: PantryItemView = {
      foodId: item.food_id,
      name: item.canonical_name,
      amount: formatAmount(item.amount, item.unit),
      state: item.stock_state ?? "stocked",
    };
    const bucket = buckets.get(item.category_id);
    if (bucket) {
      bucket.push(view);
    } else {
      buckets.set(item.category_id, [view]);
    }
  }

  const groups: PantryCategoryView[] = [];
  for (const category of categories) {
    const bucket = buckets.get(category.id);
    if (!bucket) continue;
    groups.push({ id: category.id, name: category.label, items: bucket });
    buckets.delete(category.id);
  }

  const uncategorized = [...buckets.values()].flat();
  if (uncategorized.length > 0) {
    groups.push({ id: null, name: UNCATEGORIZED_LABEL, items: uncategorized });
  }

  return groups;
};

// Merge by food_id: a derived row keeps its fact and gains the "added" badge;
// stored-only rows append.
export const mergeShoppingList = (
  derived: DerivedListRow[],
  stored: StoredListRow[],
): ShoppingListRowView[] => {
  const storedById = new Map(stored.map(row => [row.food_id, row]));

  const rows: ShoppingListRowView[] = derived.map(row => ({
    foodId: row.food_id,
    name: row.canonical_name,
    fact: derivedFact(row),
    stored: storedById.has(row.food_id),
    source: storedById.get(row.food_id)?.source ?? null,
  }));

  const derivedIds = new Set(derived.map(row => row.food_id));
  for (const row of stored) {
    if (derivedIds.has(row.food_id)) continue;
    rows.push({
      foodId: row.food_id,
      name: row.canonical_name,
      stored: true,
      source: row.source,
    });
  }

  return rows;
};

export type PantryViews = {
  categories: PantryCategoryView[];
  list: ShoppingListRowView[];
  itemCount: number;
};

export const toPantryViews = (
  snapshot: GetPantrySnapshotResponse | undefined,
  categories: Category[],
): PantryViews => ({
  categories: groupPantryItems(snapshot?.items ?? [], categories),
  list: mergeShoppingList(
    snapshot?.list.derived ?? [],
    snapshot?.list.stored ?? [],
  ),
  itemCount: snapshot?.items.length ?? 0,
});
