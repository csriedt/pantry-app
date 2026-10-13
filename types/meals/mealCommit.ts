/**
 * The meal-commit deduction rule, as a pure function: recipe ingredients
 * × current pantry × the foods' conversion metadata → the deductions
 * actually bookable and the items that are skipped instead.
 *
 * Commensurable-only, with conversions from the food's optional metadata:
 * a shared unit is 1:1; density converts mass↔volume (g per ml); pack
 * sizes convert a pack unit to grams ("1 can = 400 g"). Anything without a
 * path is skipped — the app does not try, and the receipt says so.
 *
 * Deductions are clamped to what the pantry holds: booked is a record of
 * what was actually taken, never of what a recipe wished for.
 */

export type CommitIngredient = {
  food_id: string;
  amount: number;
  unit: string | null;
};

export type CommitPantryItem = {
  food_id: string;
  amount: number | null;
  unit: string | null;
  /** Level-mode items carry no amount to deduct. */
  stock_state: string | null;
};

export type CommitConversion = {
  density_g_per_ml: number | null;
  pack_sizes: { unit: string; grams: number }[] | null;
};

export type SkippedItem = {
  food_id: string;
  reason: "not-held" | "level-mode" | "not-commensurable";
};

export type MealCommitPlan = {
  /** Deductions to book, each in the PANTRY item's unit. */
  booked: { food_id: string; amount: number; unit: string | null }[];
  skipped: SkippedItem[];
};

const GRAMS_PER: Record<string, number> = {
  g: 1,
  kg: 1000,
  mg: 0.001,
  lb: 453.592,
  oz: 28.3495,
};
const ML_PER: Record<string, number> = {
  ml: 1,
  l: 1000,
  cl: 10,
  tsp: 5,
  tbsp: 15,
  cup: 240,
};

const toGrams = (amount: number, unit: string): number | null => {
  const factor = GRAMS_PER[unit];
  return factor === undefined ? null : amount * factor;
};

const toMl = (amount: number, unit: string): number | null => {
  const factor = ML_PER[unit];
  return factor === undefined ? null : amount * factor;
};

/**
 * Convert `amount` of `fromUnit` into `toUnit`. Everything lands in a base
 * first (grams or ml), then converts onward; density bridges the two
 * bases, pack sizes bridge a pack unit to grams on either side.
 */
const convert = (
  amount: number,
  fromUnit: string,
  toUnit: string,
  conversion: CommitConversion,
): number | null => {
  if (fromUnit === toUnit) return amount;

  const density =
    conversion.density_g_per_ml && conversion.density_g_per_ml > 0
      ? conversion.density_g_per_ml
      : null;

  const grams0 = toGrams(amount, fromUnit);
  let grams = grams0;
  const ml = toMl(amount, fromUnit);
  if (grams === null && ml === null) {
    const pack = conversion.pack_sizes?.find(entry => entry.unit === fromUnit);
    if (pack) grams = amount * pack.grams;
  }
  if (grams === null && ml === null) return null;

  if (grams !== null) {
    if (toUnit === "g") return grams;
    const targetGrams = toGrams(1, toUnit);
    if (targetGrams !== null) return grams / targetGrams;
    if (density && toUnit === "ml") return grams / density;
    const targetMl = toMl(1, toUnit);
    if (density && targetMl !== null) return grams / density / targetMl;
    const pack = conversion.pack_sizes?.find(entry => entry.unit === toUnit);
    if (pack && pack.grams > 0) return grams / pack.grams;
    return null;
  }

  if (ml === null) return null;
  // ml side
  if (toUnit === "ml") return ml;
  const targetMl = toMl(1, toUnit);
  if (targetMl !== null) return ml / targetMl;
  if (density) {
    const asGrams = ml * density;
    const targetGrams = toGrams(1, toUnit);
    if (targetGrams !== null) return asGrams / targetGrams;
    const pack = conversion.pack_sizes?.find(entry => entry.unit === toUnit);
    if (pack && pack.grams > 0) return asGrams / pack.grams;
  }
  return null;
};

export function computeMealCommit(
  ingredients: CommitIngredient[],
  items: CommitPantryItem[],
  conversions: Record<string, CommitConversion>,
): MealCommitPlan {
  const byFood = new Map(items.map(item => [item.food_id, item]));

  const booked: MealCommitPlan["booked"] = [];
  const skipped: SkippedItem[] = [];

  for (const ingredient of ingredients) {
    const item = byFood.get(ingredient.food_id);
    if (!item) {
      skipped.push({ food_id: ingredient.food_id, reason: "not-held" });
      continue;
    }
    if (item.amount === null || item.stock_state !== null) {
      skipped.push({ food_id: ingredient.food_id, reason: "level-mode" });
      continue;
    }

    const needed =
      ingredient.unit && item.unit && ingredient.unit !== item.unit
        ? convert(
            ingredient.amount,
            ingredient.unit,
            item.unit,
            conversions[ingredient.food_id] ?? {
              density_g_per_ml: null,
              pack_sizes: null,
            },
          )
        : ingredient.unit === item.unit
          ? ingredient.amount
          : null;

    if (needed === null || !Number.isFinite(needed)) {
      skipped.push({ food_id: ingredient.food_id, reason: "not-commensurable" });
      continue;
    }

    // Clamp to what is held; booked is a record of what was taken.
    booked.push({
      food_id: ingredient.food_id,
      amount: Math.min(needed, item.amount),
      unit: item.unit,
    });
  }

  return { booked, skipped };
}
