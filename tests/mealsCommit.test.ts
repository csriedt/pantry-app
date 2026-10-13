import { describe, expect, it } from "vitest";

import {
  CommitConversion,
  CommitIngredient,
  CommitPantryItem,
  computeMealCommit,
} from "@/types/meals/mealCommit";

// The deduction rule is the meals domain's core invariant (commensurable
// only, clamped to what is held, everything else skipped with a reason),
// so it is pinned here as pure logic — no DB, no client.

const ingredient = (
  food_id: string,
  amount: number,
  unit: string | null = "g",
): CommitIngredient => ({ food_id, amount, unit });

const item = (
  food_id: string,
  amount: number | null,
  unit: string | null,
  stock_state: string | null = null,
): CommitPantryItem => ({ food_id, amount, unit, stock_state });

const NO_CONVERSIONS: Record<string, CommitConversion> = {};

describe("computeMealCommit", () => {
  it("deducts like-for-like units one-to-one", () => {
    const plan = computeMealCommit(
      [ingredient("a", 300)],
      [item("a", 500, "g")],
      NO_CONVERSIONS,
    );
    expect(plan.booked).toEqual([{ food_id: "a", amount: 300, unit: "g" }]);
    expect(plan.skipped).toEqual([]);
  });

  it("clamps the deduction to what the pantry holds", () => {
    const plan = computeMealCommit(
      [ingredient("a", 300)],
      [item("a", 120, "g")],
      NO_CONVERSIONS,
    );
    expect(plan.booked).toEqual([{ food_id: "a", amount: 120, unit: "g" }]);
  });

  it("converts within the same dimension", () => {
    const plan = computeMealCommit(
      [ingredient("a", 1, "kg")],
      [item("a", 500, "g")],
      NO_CONVERSIONS,
    );
    // 1 kg needed, 500 g held → clamped at 500 g.
    expect(plan.booked).toEqual([{ food_id: "a", amount: 500, unit: "g" }]);
  });

  it("converts mass to volume through the food's density", () => {
    const plan = computeMealCommit(
      [ingredient("a", 100, "g")],
      [item("a", 200, "ml")],
      { a: { density_g_per_ml: 1, pack_sizes: null } },
    );
    // 100 g at density 1 → 100 ml, under the 200 ml held.
    expect(plan.booked).toEqual([{ food_id: "a", amount: 100, unit: "ml" }]);
  });

  it("converts a pack unit to grams through pack sizes", () => {
    const plan = computeMealCommit(
      [ingredient("a", 2, "cans")],
      [item("a", 500, "g")],
      { a: { density_g_per_ml: null, pack_sizes: [{ unit: "cans", grams: 400 }] } },
    );
    // 2 cans × 400 g = 800 g needed → clamped to the 500 g held.
    expect(plan.booked).toEqual([{ food_id: "a", amount: 500, unit: "g" }]);
  });

  it("skips items that are not held", () => {
    const plan = computeMealCommit(
      [ingredient("a", 1)],
      [item("b", 500, "g")],
      NO_CONVERSIONS,
    );
    expect(plan.booked).toEqual([]);
    expect(plan.skipped).toEqual([{ food_id: "a", reason: "not-held" }]);
  });

  it("skips level-mode items — there is no amount to deduct", () => {
    const plan = computeMealCommit(
      [ingredient("a", 100)],
      [item("a", null, null, "short")],
      NO_CONVERSIONS,
    );
    expect(plan.booked).toEqual([]);
    expect(plan.skipped).toEqual([{ food_id: "a", reason: "level-mode" }]);
  });

  it("skips items with no commensurable path, without trying", () => {
    const plan = computeMealCommit(
      [ingredient("a", 1, "bunch")],
      [item("a", 500, "g")],
      { a: { density_g_per_ml: null, pack_sizes: null } },
    );
    expect(plan.booked).toEqual([]);
    expect(plan.skipped).toEqual([
      { food_id: "a", reason: "not-commensurable" },
    ]);
  });
});
