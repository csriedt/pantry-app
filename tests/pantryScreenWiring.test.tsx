// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PantryScreen } from "@/screens/pantry-screen";
import { SessionUserIdProvider } from "@/components/providers/session-user-provider";
import { createUserFoodAction } from "@/actions/catalog/createUserFoodAction";
import { getPantrySnapshotAction } from "@/actions/pantry/getPantrySnapshotAction";
import { listCategoriesAction } from "@/actions/catalog/listCategoriesAction";
import { removePantryItemAction } from "@/actions/pantry/removePantryItemAction";
import { searchFoodsAction } from "@/actions/catalog/searchFoodsAction";
import { upsertPantryItemAction } from "@/actions/pantry/upsertPantryItemAction";
import type { GetPantrySnapshotResponse } from "@/types/pantry/getPantrySnapshotResponse";

// The action modules import the server-only Supabase clients; the wiring
// under test only needs their payload shapes.
vi.mock("@/actions/pantry/getPantrySnapshotAction", () => ({
  getPantrySnapshotAction: vi.fn(),
}));
vi.mock("@/actions/catalog/listCategoriesAction", () => ({
  listCategoriesAction: vi.fn(),
}));
vi.mock("@/actions/catalog/searchFoodsAction", () => ({
  searchFoodsAction: vi.fn(),
}));
vi.mock("@/actions/catalog/createUserFoodAction", () => ({
  createUserFoodAction: vi.fn(),
}));
vi.mock("@/actions/pantry/upsertPantryItemAction", () => ({
  upsertPantryItemAction: vi.fn(),
}));
vi.mock("@/actions/pantry/removePantryItemAction", () => ({
  removePantryItemAction: vi.fn(),
}));
// The screen navigates through the router; none of these cases navigate.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ONION_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const snapshot = (
  overrides: Partial<GetPantrySnapshotResponse> = {},
): GetPantrySnapshotResponse => ({
  version: 7,
  items: [
    {
      food_id: ONION_ID,
      canonical_name: "Onions",
      category_id: "cccccccc-0000-0000-0000-000000000001",
      amount: 3,
      unit: null,
      stock_state: null,
      added_at: "2026-10-01T00:00:00.000Z",
    },
    {
      food_id: "aaaaaaaa-0000-0000-0000-000000000002",
      canonical_name: "Rice",
      category_id: "cccccccc-0000-0000-0000-000000000002",
      amount: 500,
      unit: "g",
      stock_state: null,
      added_at: "2026-10-01T00:00:00.000Z",
    },
  ],
  list: {
    derived: [
      {
        food_id: "aaaaaaaa-0000-0000-0000-000000000003",
        canonical_name: "Olive oil",
        amount: 0,
        unit: "ml",
        reason: "out",
        used_28d: 6,
      },
    ],
    stored: [
      {
        food_id: "aaaaaaaa-0000-0000-0000-000000000004",
        canonical_name: "Cumin",
        source: "manual",
      },
    ],
  },
  ...overrides,
});

const seed = () => {
  vi.mocked(listCategoriesAction).mockResolvedValue({
    data: {
      categories: [
        {
          id: "cccccccc-0000-0000-0000-000000000001",
          slug: "produce",
          label: "Produce",
          sort: 1,
        },
        {
          id: "cccccccc-0000-0000-0000-000000000002",
          slug: "dry-goods",
          label: "Dry goods",
          sort: 2,
        },
      ],
    },
  });
  vi.mocked(getPantrySnapshotAction).mockResolvedValue({ data: snapshot() });
  vi.mocked(searchFoodsAction).mockResolvedValue({ data: { foods: [] } });
  vi.mocked(upsertPantryItemAction).mockResolvedValue({ data: { version: 8 } });
  vi.mocked(removePantryItemAction).mockResolvedValue({ data: { version: 9 } });
  vi.mocked(createUserFoodAction).mockResolvedValue({
    data: {
      food: {
        id: "aaaaaaaa-0000-0000-0000-000000000005",
        canonical_name: "Cumin",
        category_id: null,
        scope: "user",
      },
    },
  });
};

const renderScreen = (userId: string | null) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionUserIdProvider userId={userId}>
        <PantryScreen />
      </SessionUserIdProvider>
    </QueryClientProvider>,
  );
};

/**
 * The screen-wiring contract: the user id arrives from the server and a null
 * one never dispatches, the envelope maps onto the category and list view
 * models, and every write leaves through the domain hooks.
 */
describe("pantry screen wiring", () => {
  it("renders the loading state and dispatches nothing while the session is unresolved", () => {
    seed();
    const { getByText, queryByText } = renderScreen(null);

    expect(getByText("Pantry")).toBeTruthy();
    expect(queryByText("Add an item")).toBeNull();
    expect(getPantrySnapshotAction).not.toHaveBeenCalled();
    expect(upsertPantryItemAction).not.toHaveBeenCalled();
  });

  it("groups the envelope by category and merges the list halves", async () => {
    seed();
    const { getByText, findByText } = renderScreen(USER_ID);

    await findByText("2 items");

    expect(getPantrySnapshotAction).toHaveBeenCalledWith({});
    expect(listCategoriesAction).toHaveBeenCalledWith({});
    expect(getByText("Produce")).toBeTruthy();
    expect(getByText("Dry goods")).toBeTruthy();
    // The derived row keeps its fact; the stored row shows as added.
    expect(getByText("0 left · used 6× in 28 days")).toBeTruthy();
    expect(getByText("Cumin")).toBeTruthy();
  });

  it("surfaces the read's error and retries it", async () => {
    seed();
    vi.mocked(getPantrySnapshotAction).mockResolvedValue({
      error: {
        message: "The read timed out before it finished.",
        code: "timeout",
      },
    });

    const { findByText, getByText } = renderScreen(USER_ID);

    expect(await findByText(/Couldn.t load your pantry\./)).toBeTruthy();

    await act(async () => {
      fireEvent.click(getByText("Retry"));
    });

    expect(getPantrySnapshotAction).toHaveBeenCalledTimes(2);
  });

  it("writes a level change from the item sheet through the upsert hook", async () => {
    seed();
    const { findByText, getByText } = renderScreen(USER_ID);

    fireEvent.click(await findByText("Onions"));

    await act(async () => {
      fireEvent.click(getByText("out"));
    });

    // Exactly one mode is sent — the table's XOR rejects a both-set row.
    expect(upsertPantryItemAction).toHaveBeenCalledWith({
      food_id: ONION_ID,
      stock_state: "out",
    });
  });
});
