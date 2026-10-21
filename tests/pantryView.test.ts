import { describe, expect, it } from "vitest";

import type { Category } from "@/types/catalog/category";
import type {
  DerivedListRow,
  StoredListRow,
} from "@/types/pantry/getPantrySnapshotResponse";
import type { PantryItem } from "@/types/pantry/pantryItem";
import {
  UNCATEGORIZED_LABEL,
  formatAmount,
  groupPantryItems,
  mergeShoppingList,
  toPantryViews,
} from "@/lib/pantry-view";
import { newSeed, sampleSeeded } from "@/lib/sample";

const category = (id: string, label: string, sort: number): Category => ({
  id,
  slug: label.toLowerCase(),
  label,
  sort,
});

const derivedRow = (
  overrides: Partial<DerivedListRow> = {},
): DerivedListRow => ({
  food_id: "d1",
  canonical_name: "Rice",
  amount: 500,
  unit: "g",
  reason: "low",
  used_28d: 3,
  ...overrides,
});

const storedRow = (
  overrides: Partial<StoredListRow> = {},
): StoredListRow => ({
  food_id: "s1",
  canonical_name: "Cumin",
  source: "manual",
  ...overrides,
});

/**
 * The client half of the snapshot envelope's contract: the grouping is the
 * client's job, and so is the derived/stored merge. Both screens render from
 * these helpers, so this is the one place a regression in either would show.
 */
describe("pantry view models", () => {
  describe("formatAmount", () => {
    it("renders a counted amount with its unit", () => {
      expect(formatAmount(500, "g")).toBe("500 g");
      expect(formatAmount(1, "head")).toBe("1 head");
    });

    it("renders a bare count when there is no unit", () => {
      expect(formatAmount(3, null)).toBe("3");
      expect(formatAmount(1.5, null)).toBe("1.5");
    });

    it("returns undefined in level mode", () => {
      expect(formatAmount(null, null)).toBeUndefined();
      expect(formatAmount(null, "g")).toBeUndefined();
    });
  });

  describe("groupPantryItems", () => {
    // The categories read arrives ordered for display (`order("sort")`), so
    // the group order is the read's, whatever order the rows came back in.
    const categories = [
      category("c1", "Produce", 1),
      category("c2", "Dry goods", 2),
    ];

    const items: PantryItem[] = [
      { food_id: "f1", canonical_name: "Rice", category_id: "c2", amount: 500, unit: "g", stock_state: null, added_at: "t" },
      { food_id: "f2", canonical_name: "Onions", category_id: "c1", amount: 3, unit: null, stock_state: null, added_at: "t" },
      { food_id: "f3", canonical_name: "Olive oil", category_id: null, amount: null, unit: null, stock_state: "out", added_at: "t" },
    ];

    it("orders the groups by the categories read's sort, not by the rows", () => {
      const groups = groupPantryItems(items, categories);

      expect(groups.map(group => group.name)).toEqual([
        "Produce",
        "Dry goods",
        UNCATEGORIZED_LABEL,
      ]);
    });

    it("does not render a category with nothing in it", () => {
      const groups = groupPantryItems(
        items.filter(item => item.category_id === "c2"),
        categories,
      );

      expect(groups.map(group => group.name)).toEqual(["Dry goods"]);
    });

    it("reads a counted row as stocked, and keeps a level row's state", () => {
      const groups = groupPantryItems(items, categories);
      const produced = groups.find(
        group => group.name === "Produce",
      )?.items[0];
      const oils = groups.find(
        group => group.name === UNCATEGORIZED_LABEL,
      )?.items[0];

      expect(produced).toEqual({
        foodId: "f2",
        name: "Onions",
        amount: "3",
        state: "stocked",
      });
      expect(oils).toEqual({
        foodId: "f3",
        name: "Olive oil",
        amount: undefined,
        state: "out",
      });
    });

    it("keeps rows whose category the read did not cover", () => {
      const groups = groupPantryItems(
        [
          {
            food_id: "f4",
            canonical_name: "Soy sauce",
            category_id: "c9",
            amount: null,
            unit: null,
            stock_state: "short",
            added_at: "t",
          },
        ],
        categories,
      );

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe(UNCATEGORIZED_LABEL);
      expect(groups[0]?.items[0]?.name).toBe("Soy sauce");
    });
  });

  describe("mergeShoppingList", () => {
    it("keeps derived order and appends stored-only rows", () => {
      const rows = mergeShoppingList(
        [
          derivedRow({ food_id: "d1", canonical_name: "Rice" }),
          derivedRow({ food_id: "d2", canonical_name: "Olive oil" }),
        ],
        [storedRow({ food_id: "s1", canonical_name: "Cumin" })],
      );

      expect(rows.map(row => row.name)).toEqual([
        "Rice",
        "Olive oil",
        "Cumin",
      ]);
    });

    it("marks a food in both halves as stored and keeps the derived fact", () => {
      const rows = mergeShoppingList(
        [derivedRow({ food_id: "shared", reason: "out", amount: 0, used_28d: 6 })],
        [storedRow({ food_id: "shared", canonical_name: "Rice" })],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: "Rice",
        stored: true,
        fact: "0 left · used 6× in 28 days",
        source: "manual",
      });
    });

    it("renders the usage line for every reason", () => {
      expect(mergeShoppingList([derivedRow({ reason: "low" })], [])[0]?.fact)
        .toBe("500 g left · used 3× in 28 days");
      expect(
        mergeShoppingList([derivedRow({ reason: "declining" })], [])[0]?.fact,
      ).toBe("500 g left · used 3× in 28 days");
    });
  });

  describe("toPantryViews", () => {
    it("passes the item count through so both screens agree", () => {
      const views = toPantryViews(
        {
          version: 4,
          items: [
            { food_id: "f1", canonical_name: "Onions", category_id: "c1", amount: 3, unit: null, stock_state: null, added_at: "t" },
          ],
          list: { derived: [], stored: [] },
        },
        [category("c1", "Produce", 1)],
      );

      expect(views.itemCount).toBe(1);
      expect(views.categories).toHaveLength(1);
      expect(views.list).toEqual([]);
    });

    it("reads an empty or missing envelope as an empty dashboard", () => {
      const empty = {
        version: 0,
        items: [],
        list: { derived: [], stored: [] },
      };

      expect(toPantryViews(empty, [])).toEqual({
        categories: [],
        list: [],
        itemCount: 0,
      });
      expect(toPantryViews(undefined, [])).toEqual({
        categories: [],
        list: [],
        itemCount: 0,
      });
    });
  });
});

/**
 * The book's deterministic K-sample: a seeded draw is stable, capped, and
 * never mutates its input, so a session pins what it drew.
 */
describe("sampleSeeded", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g"];

  it("draws the same slice from the same seed", () => {
    expect(sampleSeeded(items, 3, 42)).toEqual(sampleSeeded(items, 3, 42));
  });

  it("draws a different slice from a different seed", () => {
    expect(sampleSeeded(items, 3, 42)).not.toEqual(
      sampleSeeded(items, 3, 99),
    );
  });

  it("caps the draw and keeps every item distinct", () => {
    const drawn = sampleSeeded(items, 5, 7);

    expect(drawn).toHaveLength(5);
    expect(new Set(drawn).size).toBe(5);
  });

  it("returns everything when the count exceeds the pool", () => {
    expect(sampleSeeded(items, 99, 1)).toEqual(items);
  });

  it("leaves the source order untouched", () => {
    const source = [...items];
    sampleSeeded(source, 2, 1234);

    expect(source).toEqual(items);
  });

  it("produces a seed inside the generator's range", () => {
    const seed = newSeed();

    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2147483648);
  });
});
