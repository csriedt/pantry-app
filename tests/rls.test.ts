import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Three suites live here:
//
// 1. "RLS boundary" â€” proves the harness itself: forged claims resolve
//    through auth.uid(), and a minimal policy isolates rows.
// 2. "RLS access matrix" â€” runs the real tables (categories, foods, pantry,
//    pantry_state, shopping_list_items) against the access matrix in
//    `pimp-my-pantry/SCHEMA.dbml`. Seeded auth.users rows give the FK edges
//    and auth.uid() something real to return.
// 3. "RPC pair" â€” the SECURITY INVOKER functions get_pantry_snapshot() and
//    upsert_pantry_item(), called as forged users: that is what proves RLS
//    gates them inside the function body and that the EXECUTE grant reaches
//    `authenticated`.
//
// All three run only when DATABASE_URL is set (it lives in .env.local);
// without it they skip, so `npm test` stays green on machines with no
// database. Everything runs inside transactions that are always rolled back.
//
// The pantry access-matrix assertions join with the first solve. The probe
// table below validates the harness itself.

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const databaseUrl = process.env.DATABASE_URL ?? "";

class Rollback extends Error {}

describe.skipIf(!databaseUrl)("RLS boundary", () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = postgres(databaseUrl, { max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  /** Run `body` in a transaction that is always rolled back. */
  async function inRollback(
    body: (tx: postgres.TransactionSql) => Promise<void>,
  ): Promise<void> {
    try {
      await sql.begin(async (tx) => {
        await body(tx);
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
  }

  /** Step the transaction down to `authenticated` carrying forged claims. */
  async function asUser(
    tx: postgres.TransactionSql,
    sub: string,
  ): Promise<void> {
    await tx`reset role`;
    const claims = { sub, role: "authenticated" };
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    await tx`set local role authenticated`;
  }

  /** Run `operation` under a savepoint; returns the error it raised, if any. */
  async function attempt(
    tx: postgres.TransactionSql,
    operation: () => Promise<unknown>,
  ): Promise<Error | null> {
    await tx`savepoint attempt`;
    let failure: Error | null = null;
    try {
      await operation();
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    await tx`rollback to savepoint attempt`;
    return failure;
  }

  /** The probe table mirrors the shape every user-owned table will have. */
  async function createProbeTable(tx: postgres.TransactionSql): Promise<void> {
    await tx`create table _rls_probe (id int primary key, user_id uuid not null)`;
    await tx`alter table _rls_probe enable row level security`;
    await tx`
      create policy _rls_probe_own_rows on _rls_probe
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)
    `;
    await tx`grant select, insert on _rls_probe to authenticated`;
  }

  it("forges identity through auth.uid()", async () => {
    const sub = randomUUID();

    await inRollback(async (tx) => {
      await asUser(tx, sub);

      const [row] = await tx<{ uid: string }[]>`select auth.uid() as uid`;

      expect(row.uid).toBe(sub);
    });
  });

  it("shows each user only their own rows", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      await createProbeTable(tx);
      await tx`insert into _rls_probe values (1, ${userA}), (2, ${userB})`;

      await asUser(tx, userA);
      const rowsForA =
        await tx<{ id: number }[]>`select id from _rls_probe order by id`;
      expect(rowsForA.map((row) => row.id)).toEqual([1]);

      await asUser(tx, userB);
      const rowsForB =
        await tx<{ id: number }[]>`select id from _rls_probe order by id`;
      expect(rowsForB.map((row) => row.id)).toEqual([2]);
    });
  });

  it("blocks writes that cross the identity boundary", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      await createProbeTable(tx);

      await asUser(tx, userA);

      const denial = await attempt(
        tx,
        () => tx`insert into _rls_probe values (1, ${userB})`,
      );
      expect(denial?.message).toMatch(/row-level security/i);

      await tx`insert into _rls_probe values (2, ${userA})`;
      const ownRows =
        await tx<{ id: number }[]>`
          select id from _rls_probe where id = 2
        `;
      expect(ownRows).toHaveLength(1);
    });
  });
});

describe.skipIf(!databaseUrl)("RLS access matrix", () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = postgres(databaseUrl, { max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  /** Run `body` in a transaction that is always rolled back. */
  async function inRollback(
    body: (tx: postgres.TransactionSql) => Promise<void>,
  ): Promise<void> {
    try {
      await sql.begin(async (tx) => {
        await body(tx);
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
  }

  /** Step the transaction down to `authenticated` carrying forged claims. */
  async function asUser(
    tx: postgres.TransactionSql,
    sub: string,
  ): Promise<void> {
    await tx`reset role`;
    const claims = { sub, role: "authenticated" };
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    await tx`set local role authenticated`;
  }

  /**
   * Run `operation` under a savepoint and return the error it raised. Throws
   * if the operation unexpectedly succeeded â€” matrix assertions want failures.
   */
  async function failureOf(
    tx: postgres.TransactionSql,
    operation: () => Promise<unknown>,
  ): Promise<Error> {
    await tx`savepoint attempt`;
    let failure: Error | null = null;
    try {
      await operation();
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    await tx`rollback to savepoint attempt`;
    if (!failure) {
      throw new Error("expected the statement to fail, but it succeeded");
    }
    return failure;
  }

  /** Seed auth.users rows so FK edges and `auth.uid()` have real targets. */
  async function seedUsers(
    tx: postgres.TransactionSql,
    subs: string[],
  ): Promise<void> {
    for (const sub of subs) {
      await tx`insert into auth.users (id, email) values (${sub}, ${`rls-${sub}@example.test`})`;
    }
  }

  async function seedCategory(tx: postgres.TransactionSql): Promise<string> {
    const [row] = await tx<{ id: string }[]>`
      insert into categories (slug, label, "sort")
      values (${`rls-${randomUUID()}`}, 'RLS probe', 0)
      returning id
    `;
    return row.id;
  }

  async function seedGlobalFood(tx: postgres.TransactionSql): Promise<string> {
    const [row] = await tx<{ id: string }[]>`
      insert into foods (scope, owner_id, canonical_name, normalized_name, created_at)
      values ('global', null, 'RLS probe global', ${`rls-${randomUUID()}`}, now())
      returning id
    `;
    return row.id;
  }

  // ---- categories: R all; writes are operator/service-role only ----

  it("lets every authenticated user read categories", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const categoryId = await seedCategory(tx);

      await asUser(tx, user);
      const visible =
        await tx<{ id: string }[]>`select id from categories where id = ${categoryId}`;

      expect(visible).toHaveLength(1);
    });
  });

  it("blocks all writes to categories", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const categoryId = await seedCategory(tx);
      await asUser(tx, user);

      const insert = await failureOf(tx, () =>
        tx`insert into categories (slug, label) values (${`rls-${randomUUID()}`}, 'nope')`,
      );
      expect(insert.message).toMatch(/permission denied/i);

      const update = await failureOf(tx, () =>
        tx`update categories set label = 'nope' where id = ${categoryId}`,
      );
      expect(update.message).toMatch(/permission denied/i);

      const del = await failureOf(tx, () =>
        tx`delete from categories where id = ${categoryId}`,
      );
      expect(del.message).toMatch(/permission denied/i);
    });
  });

  // ---- foods: R globals + own user rows; W own user rows ----

  it("shows global foods to every user", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const globalId = await seedGlobalFood(tx);

      await asUser(tx, userA);
      expect(
        await tx<{ id: string }[]>`select id from foods where id = ${globalId}`,
      ).toHaveLength(1);

      await asUser(tx, userB);
      expect(
        await tx<{ id: string }[]>`select id from foods where id = ${globalId}`,
      ).toHaveLength(1);
    });
  });

  it("lets a user read their own food rows and nobody else's", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      await seedUsers(tx, [userA, userB]);

      await asUser(tx, userA);
      await tx`
        insert into foods (scope, owner_id, canonical_name, normalized_name)
        values ('user', ${userA}, 'RLS probe own', ${`rls-${randomUUID()}`})
      `;
      expect(
        await tx<{ id: string }[]>`select id from foods where owner_id = ${userA}`,
      ).toHaveLength(1);

      await asUser(tx, userB);
      expect(
        await tx<{ id: string }[]>`select id from foods where owner_id = ${userA}`,
      ).toHaveLength(0);
    });
  });

  it("blocks food rows aimed at another user or the global scope", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      await seedUsers(tx, [userA, userB]);
      await asUser(tx, userA);

      const aimedAtB = await failureOf(tx, () =>
        tx`insert into foods (scope, owner_id, canonical_name, normalized_name)
           values ('user', ${userB}, 'smuggle', ${`rls-${randomUUID()}`})`,
      );
      expect(aimedAtB.message).toMatch(/row-level security/i);

      const aimedAtGlobal = await failureOf(tx, () =>
        tx`insert into foods (scope, owner_id, canonical_name, normalized_name)
           values ('global', null, 'smuggle', ${`rls-${randomUUID()}`})`,
      );
      expect(aimedAtGlobal.message).toMatch(/row-level security/i);
    });
  });

  it("lets a user update their food row but never another user's", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      await seedUsers(tx, [userA, userB]);

      await asUser(tx, userA);
      const [row] = await tx<{ id: string }[]>`
        insert into foods (scope, owner_id, canonical_name, normalized_name)
        values ('user', ${userA}, 'before', ${`rls-${randomUUID()}`})
        returning id
      `;
      await tx`update foods set canonical_name = 'after' where id = ${row.id}`;
      const [renamed] = await tx<{ canonical_name: string }[]>`
        select canonical_name from foods where id = ${row.id}
      `;
      expect(renamed.canonical_name).toBe("after");

      // Another user cannot see the row, so their update is a silent no-op.
      await asUser(tx, userB);
      await tx`update foods set canonical_name = 'hijacked' where id = ${row.id}`;
      expect(
        await tx<{ id: string }[]>`select id from foods where id = ${row.id}`,
      ).toHaveLength(0);

      await asUser(tx, userA);
      const [final] = await tx<{ canonical_name: string }[]>`
        select canonical_name from foods where id = ${row.id}
      `;
      expect(final.canonical_name).toBe("after");
    });
  });

  // ---- pantry: R/W/D own rows ----

  it("lets a user manage their own pantry row end to end", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);
      await asUser(tx, user);

      const [row] = await tx<{ id: string }[]>`
        insert into pantry (user_id, food_id, amount, unit)
        values (${user}, ${foodId}, 2, 'cans')
        returning id
      `;
      const [counted] = await tx<{ amount: string }[]>`
        select amount from pantry where id = ${row.id}
      `;
      expect(counted.amount).toBe("2.0000");

      await tx`update pantry set amount = 7 where id = ${row.id}`;
      const [recounted] = await tx<{ amount: string }[]>`
        select amount from pantry where id = ${row.id}
      `;
      expect(recounted.amount).toBe("7.0000");

      // Switching to level mode: amount clears, stock_state takes over.
      await tx`update pantry set amount = null, stock_state = 'short' where id = ${row.id}`;
      const [level] = await tx<{ stock_state: string }[]>`
        select stock_state from pantry where id = ${row.id}
      `;
      expect(level.stock_state).toBe("short");

      await tx`delete from pantry where id = ${row.id}`;
      expect(
        await tx<{ id: string }[]>`select id from pantry where id = ${row.id}`,
      ).toHaveLength(0);
    });
  });

  it("keeps another user's pantry rows out of reach", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [userA, userB]);

      await asUser(tx, userA);
      const [row] = await tx<{ id: string }[]>`
        insert into pantry (user_id, food_id, amount, unit)
        values (${userA}, ${foodId}, 1, 'can')
        returning id
      `;

      await asUser(tx, userB);
      expect(await tx`select id from pantry`).toHaveLength(0);

      await tx`delete from pantry where id = ${row.id}`;
      await asUser(tx, userA);
      expect(
        await tx<{ id: string }[]>`select id from pantry where id = ${row.id}`,
      ).toHaveLength(1);
    });
  });

  it("enforces amount XOR stock_state at the column level", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);
      await asUser(tx, user);

      const neither = await failureOf(tx, () =>
        tx`insert into pantry (user_id, food_id) values (${user}, ${foodId})`,
      );
      expect(neither.message).toMatch(/pantry_amount_xor_stock_state/);

      const both = await failureOf(tx, () =>
        tx`insert into pantry (user_id, food_id, amount, stock_state)
           values (${user}, ${foodId}, 1, 'out')`,
      );
      expect(both.message).toMatch(/pantry_amount_xor_stock_state/);
    });
  });

  // ---- pantry_state: R own; W own (insert/update for the future RPC) ----

  it("lets a user create and bump their own doorbell", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      await seedUsers(tx, [user]);
      await asUser(tx, user);

      await tx`
        insert into pantry_state (user_id, state_version, last_mutated_by)
        values (${user}, 1, 'user')
      `;
      const [created] = await tx<{ state_version: string }[]>`
        select state_version from pantry_state where user_id = ${user}
      `;
      expect(Number(created.state_version)).toBe(1);

      // The shape the write-intent RPC will use: invoker bump of own row.
      await tx`
        update pantry_state
        set state_version = state_version + 1, last_mutated_by = 'user', updated_at = now()
        where user_id = ${user}
      `;
      const [bumped] = await tx<{ state_version: string }[]>`
        select state_version from pantry_state where user_id = ${user}
      `;
      expect(Number(bumped.state_version)).toBe(2);
    });
  });

  it("hides another user's doorbell and blocks its deletion", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      await seedUsers(tx, [userA, userB]);

      await asUser(tx, userA);
      await tx`
        insert into pantry_state (user_id, state_version, last_mutated_by)
        values (${userA}, 1, 'user')
      `;

      await asUser(tx, userB);
      expect(await tx`select user_id from pantry_state`).toHaveLength(0);

      // No DELETE grant: users never delete the doorbell (tombstone is
      // service-role territory).
      const denial = await failureOf(tx, () =>
        tx`delete from pantry_state where user_id = ${userA}`,
      );
      expect(denial.message).toMatch(/permission denied/i);
    });
  });

  // ---- shopping_list_items: R/W own rows (delete-only checkoff) ----

  it("adds and checks off list items", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);
      await asUser(tx, user);

      const [item] = await tx<{ id: string }[]>`
        insert into shopping_list_items (user_id, food_id, source)
        values (${user}, ${foodId}, 'manual')
        returning id
      `;
      expect(await tx`select id from shopping_list_items`).toHaveLength(1);

      await tx`delete from shopping_list_items where id = ${item.id}`;
      expect(await tx`select id from shopping_list_items`).toHaveLength(0);
    });
  });

  it("keeps list items user-scoped and insert/delete only", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [userA, userB]);

      await asUser(tx, userA);
      await tx`
        insert into shopping_list_items (user_id, food_id, source)
        values (${userA}, ${foodId}, 'manual')
      `;

      await asUser(tx, userB);
      expect(await tx`select id from shopping_list_items`).toHaveLength(0);

      // No UPDATE grant: list rows are added and checked off, never edited.
      const update = await failureOf(tx, () =>
        tx`update shopping_list_items set source = 'changed' where user_id = ${userA}`,
      );
      expect(update.message).toMatch(/permission denied/i);
    });
  });

  // ---- recipes + ingredients: R all; writes are server-only ----

  async function seedRecipe(tx: postgres.TransactionSql): Promise<string> {
    const [row] = await tx<{ id: string }[]>`
      insert into recipes (itemset_key, revision, source, created_at)
      values (${`rls-${randomUUID()}`}, 1, 'generated', now())
      returning id
    `;
    return row.id;
  }

  it("shows recipes and their ingredients to every user", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const recipeId = await seedRecipe(tx);
      const foodId = await seedGlobalFood(tx);
      await tx`
        insert into recipe_ingredients (recipe_id, food_id, amount, unit)
        values (${recipeId}, ${foodId}, 2, 'cans')
      `;

      await asUser(tx, userA);
      expect(
        await tx<{ id: string }[]>`select id from recipes where id = ${recipeId}`,
      ).toHaveLength(1);
      expect(
        await tx<{ id: string }[]>`select id from recipe_ingredients where recipe_id = ${recipeId}`,
      ).toHaveLength(1);

      await asUser(tx, userB);
      expect(
        await tx<{ id: string }[]>`select id from recipes where id = ${recipeId}`,
      ).toHaveLength(1);
      expect(
        await tx<{ id: string }[]>`select id from recipe_ingredients where recipe_id = ${recipeId}`,
      ).toHaveLength(1);
    });
  });

  // ---- meals: R/W own rows; undo is an update, never a delete ----

  it("keeps meals scoped to their user and undeletable", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const recipeId = await seedRecipe(tx);
      await seedUsers(tx, [userA, userB]);

      await asUser(tx, userA);
      const [meal] = await tx<{ id: string }[]>`
        insert into meals (user_id, recipe_id, writer)
        values (${userA}, ${recipeId}, 'user')
        returning id
      `;
      expect(await tx`select id from meals`).toHaveLength(1);

      // undo = compensating update of undone_at
      await tx`update meals set undone_at = now() where id = ${meal.id}`;
      const [undone] = await tx<{ undone_at: string | null }[]>`
        select undone_at from meals where id = ${meal.id}
      `;
      expect(undone.undone_at).not.toBeNull();

      await asUser(tx, userB);
      expect(await tx`select id from meals`).toHaveLength(0);

      const denial = await failureOf(tx, () =>
        tx`delete from meals where id = ${meal.id}`,
      );
      expect(denial.message).toMatch(/permission denied/i);
    });
  });

  // ---- trends: R all; written by the cron only ----

  it("exposes trend runs and rows read-only to every user", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const recipeId = await seedRecipe(tx);
      const [run] = await tx<{ id: string }[]>`
        insert into recipe_trend_runs (scope, horizon, computed_at, status)
        values ('global', 'trend', now(), 'ok')
        returning id
      `;
      await tx`
        insert into recipe_trends (run_id, recipe_id, cooks, kitchens, rank)
        values (${run.id}, ${recipeId}, 12, 20, 1)
      `;

      await asUser(tx, user);
      expect(
        await tx<{ id: string }[]>`select id from recipe_trend_runs where id = ${run.id}`,
      ).toHaveLength(1);
      expect(
        await tx<{ run_id: string }[]>`select run_id from recipe_trends`,
      ).toHaveLength(1);

      const denial = await failureOf(tx, () =>
        tx`insert into recipe_trend_runs (scope, horizon, status)
           values ('global', 'trend', 'ok')`,
      );
      expect(denial.message).toMatch(/permission denied/i);
    });
  });

  // ---- ai economics: server-only, unreachable as authenticated ----

  it("keeps the ai tables server-only", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      await seedUsers(tx, [user]);
      await tx`
        insert into ai_reservations (user_id, reserved_cost, status)
        values (${user}, 0.5, 'reserved')
      `;

      await asUser(tx, user);

      const readEvents = await failureOf(tx, () =>
        tx`select id from ai_events limit 1`,
      );
      expect(readEvents.message).toMatch(/permission denied/i);

      const writeEvent = await failureOf(tx, () =>
        tx`insert into ai_events (model, input_tokens, output_tokens, cache_tokens, cost, rates)
           values ('test-model', 1, 1, 0, 0.001, '{}'::jsonb)`,
      );
      expect(writeEvent.message).toMatch(/permission denied/i);

      const readModels = await failureOf(tx, () =>
        tx`select id from ai_models limit 1`,
      );
      expect(readModels.message).toMatch(/permission denied/i);
    });
  });

  // ---- deletion_requests: R/insert own (cancel waits on the RPC branch) ----

  it("lets a user request deletion and see only their own request", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      await seedUsers(tx, [userA, userB]);

      await asUser(tx, userA);
      await tx`insert into deletion_requests (user_id, execute_after) values (${userA}, now())`;
      expect(await tx`select id from deletion_requests`).toHaveLength(1);

      await asUser(tx, userB);
      expect(await tx`select id from deletion_requests`).toHaveLength(0);
    });
  });
});

// The RPC pair: get_pantry_snapshot() and upsert_pantry_item(...). Both are
// SECURITY INVOKER, so calling them as a forged user is the whole test â€”
// RLS inside the function body decides what comes back and what lands, and
// the EXECUTE grant to `authenticated` is proved by the call succeeding at
// all. The snapshot is asserted as one envelope: version and items from a
// single read, so a tear between them cannot hide.
describe.skipIf(!databaseUrl)("RPC pair", () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = postgres(databaseUrl, { max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  /** Run `body` in a transaction that is always rolled back. */
  async function inRollback(
    body: (tx: postgres.TransactionSql) => Promise<void>,
  ): Promise<void> {
    try {
      await sql.begin(async (tx) => {
        await body(tx);
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
  }

  /** Step the transaction down to `authenticated` carrying forged claims. */
  async function asUser(
    tx: postgres.TransactionSql,
    sub: string,
  ): Promise<void> {
    await tx`reset role`;
    const claims = { sub, role: "authenticated" };
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    await tx`set local role authenticated`;
  }

  /**
   * Run `operation` under a savepoint and return the error it raised. Throws
   * if the operation unexpectedly succeeded â€” these cases want failures.
   */
  async function failureOf(
    tx: postgres.TransactionSql,
    operation: () => Promise<unknown>,
  ): Promise<Error> {
    await tx`savepoint attempt`;
    let failure: Error | null = null;
    try {
      await operation();
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    await tx`rollback to savepoint attempt`;
    if (!failure) {
      throw new Error("expected the statement to fail, but it succeeded");
    }
    return failure;
  }

  /** Seed auth.users rows so FK edges and `auth.uid()` have real targets. */
  async function seedUsers(
    tx: postgres.TransactionSql,
    subs: string[],
  ): Promise<void> {
    for (const sub of subs) {
      await tx`insert into auth.users (id, email) values (${sub}, ${`rls-${sub}@example.test`})`;
    }
  }

  async function seedGlobalFood(tx: postgres.TransactionSql): Promise<string> {
    const [row] = await tx<{ id: string }[]>`
      insert into foods (scope, owner_id, canonical_name, normalized_name, created_at)
      values ('global', null, 'RLS probe global', ${`rls-${randomUUID()}`}, now())
      returning id
    `;
    return row.id;
  }

  /**
   * Marks a JS value for a `::jsonb` parameter. postgres.js serialises the
   * value to jsonb from the cast context at runtime (an array value lands
   * as a jsonb array â€” a pre-stringified string would land as a jsonb
   * scalar and break jsonb_array_elements), but its parameter types don't
   * admit object arrays, so the value is cast through here once.
   */
  function jsonb(value: unknown): string {
    return value as string;
  }

  type SnapshotItem = {
    food_id: string;
    canonical_name: string;
    category_id: string | null;
    amount: number | null;
    unit: string | null;
    stock_state: string | null;
    added_at: string;
  };

  type Snapshot = {
    version: number;
    items: SnapshotItem[];
    list: {
      derived: {
        food_id: string;
        canonical_name: string;
        amount: number | null;
        unit: string | null;
        reason: "out" | "low" | "declining";
        used_28d: number;
      }[];
      stored: {
        food_id: string;
        canonical_name: string;
        source: string | null;
      }[];
    };
  };

  async function snapshot(
    tx: postgres.TransactionSql,
  ): Promise<Snapshot> {
    const [row] =
      await tx<{ snapshot: Snapshot }[]>`select public.get_pantry_snapshot() as snapshot`;
    return row.snapshot;
  }

  /** Call the write intent as the current user; returns the new version. */
  async function upsert(
    tx: postgres.TransactionSql,
    foodId: string,
    amount: number | null,
    unit: string | null,
    stockState: string | null,
  ): Promise<number> {
    const [row] = await tx<{ version: string }[]>`
      select public.upsert_pantry_item(${foodId}, ${amount}, ${unit}, ${stockState}) as version
    `;
    return Number(row.version);
  }

  it("returns only the caller's own pantry rows", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const foodA = await seedGlobalFood(tx);
      const foodB = await seedGlobalFood(tx);
      await seedUsers(tx, [userA, userB]);

      // Plain table writes â€” only the RPC moves the doorbell, so these rows
      // show up under version 0.
      await asUser(tx, userA);
      await tx`insert into pantry (user_id, food_id, amount, unit) values (${userA}, ${foodA}, 1, 'can')`;

      await asUser(tx, userB);
      await tx`insert into pantry (user_id, food_id, amount, unit) values (${userB}, ${foodB}, 3, 'jars')`;

      const forB = await snapshot(tx);
      expect(forB.items.map((item) => item.food_id)).toEqual([foodB]);
      expect(forB.version).toBe(0);

      await asUser(tx, userA);
      const forA = await snapshot(tx);
      expect(forA.items.map((item) => item.food_id)).toEqual([foodA]);
      expect(forA.version).toBe(0);
      expect(forA.items[0].amount).toBe(1);
      expect(forA.items[0].unit).toBe("can");
      expect(forA.items[0].category_id).toBeNull();
    });
  });

  it("returns version 0 and an empty list for a user with no doorbell", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      await seedUsers(tx, [user]);
      await asUser(tx, user);

      expect(await snapshot(tx)).toEqual({
        version: 0,
        items: [],
        list: { derived: [], stored: [] },
      });
    });
  });

  it("reads the version and the rows from one snapshot", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      const otherId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);

      // State as of an earlier write: doorbell at 7, two held rows.
      await tx`insert into pantry_state (user_id, state_version, last_mutated_by) values (${user}, 7, 'user')`;
      await tx`insert into pantry (user_id, food_id, amount, unit) values (${user}, ${foodId}, 2, 'cans')`;
      await tx`insert into pantry (user_id, food_id, stock_state) values (${user}, ${otherId}, 'short')`;

      await asUser(tx, user);
      const before = await snapshot(tx);
      expect(before.version).toBe(7);
      expect(before.items).toHaveLength(2);

      expect(await upsert(tx, foodId, 5, "cans", null)).toBe(8);

      // One read carries BOTH the bumped version and the changed row.
      const after = await snapshot(tx);
      expect(after.version).toBe(8);
      expect(after.items).toHaveLength(2);
      expect(after.items.find((item) => item.food_id === foodId)?.amount).toBe(5);
    });
  });

  it("creates the doorbell at version 1 on the first write", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);

      await asUser(tx, user);
      expect(await upsert(tx, foodId, 2, "cans", null)).toBe(1);

      await tx`reset role`;
      const [bell] =
        await tx<{ state_version: string; last_mutated_by: string; updated_at: string | null }[]>`
        select state_version, last_mutated_by, updated_at
        from pantry_state where user_id = ${user}
      `;
      expect(Number(bell.state_version)).toBe(1);
      expect(bell.last_mutated_by).toBe("user");
      expect(bell.updated_at).not.toBeNull();
    });
  });

  it("moves the version by exactly one per write, rows and version together", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);

      await asUser(tx, user);
      expect(await upsert(tx, foodId, 1, "can", null)).toBe(1);
      expect(await upsert(tx, foodId, 2, "cans", null)).toBe(2);

      // Switching to level mode clears amount/unit â€” the XOR, through the RPC.
      expect(await upsert(tx, foodId, null, null, "out")).toBe(3);

      const snap = await snapshot(tx);
      expect(snap.version).toBe(3);
      expect(snap.items).toHaveLength(1);
      expect(snap.items[0]).toMatchObject({
        stock_state: "out",
        amount: null,
        unit: null,
      });
    });
  });

  it("leaves another user's rows and doorbell untouched", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const foodA = await seedGlobalFood(tx);
      const foodB = await seedGlobalFood(tx);
      await seedUsers(tx, [userA, userB]);

      // B's existing state, written before A touches anything.
      await tx`insert into pantry (user_id, food_id, amount, unit) values (${userB}, ${foodB}, 3, 'jars')`;
      await tx`insert into pantry_state (user_id, state_version, last_mutated_by) values (${userB}, 4, 'user')`;

      await asUser(tx, userA);
      expect(await upsert(tx, foodA, 1, "can", null)).toBe(1);
      expect(await upsert(tx, foodA, 2, "cans", null)).toBe(2);

      await asUser(tx, userB);
      const forB = await snapshot(tx);
      expect(forB.version).toBe(4);
      expect(forB.items).toHaveLength(1);
      expect(forB.items[0].amount).toBe(3);

      await tx`reset role`;
      const [bell] =
        await tx<{ state_version: string }[]>`
        select state_version from pantry_state where user_id = ${userB}
      `;
      expect(Number(bell.state_version)).toBe(4);
    });
  });

  it("keeps the write for the calling user only â€” invoker RLS", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [userA, userB]);

      await asUser(tx, userA);
      expect(await upsert(tx, foodId, 2, "cans", null)).toBe(1);

      // B writes the same food. There is no user argument to aim, so the
      // write lands on B's own side and nothing of A's moves.
      await asUser(tx, userB);
      expect(await upsert(tx, foodId, 9, "cans", null)).toBe(1);

      await tx`reset role`;
      const [aRow] =
        await tx<{ amount: string }[]>`select amount from pantry where user_id = ${userA}`;
      const [bRow] =
        await tx<{ amount: string }[]>`select amount from pantry where user_id = ${userB}`;
      expect(aRow.amount).toBe("2.0000");
      expect(bRow.amount).toBe("9.0000");

      const [aBell] =
        await tx<{ state_version: string }[]>`
        select state_version from pantry_state where user_id = ${userA}
      `;
      expect(Number(aBell.state_version)).toBe(1);
    });
  });

  it("keeps amount XOR stock_state enforced through the RPC", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);

      await asUser(tx, user);

      const both = await failureOf(tx, () =>
        upsert(tx, foodId, 1, "can", "out"),
      );
      expect(both.message).toMatch(/pantry_amount_xor_stock_state/);

      const neither = await failureOf(tx, () =>
        upsert(tx, foodId, null, null, null),
      );
      expect(neither.message).toMatch(/pantry_amount_xor_stock_state/);

      // Neither failure moved the doorbell: the function body is one
      // transaction, so a rejected write cannot bump the version alone.
      expect(await snapshot(tx)).toEqual({
        version: 0,
        items: [],
        list: { derived: [], stored: [] },
      });
    });
  });

  async function seedRecipe(tx: postgres.TransactionSql): Promise<string> {
    const [row] = await tx<{ id: string }[]>`
      insert into recipes (itemset_key, revision, source, created_at)
      values (${`rls-${randomUUID()}`}, 1, 'generated', now())
      returning id
    `;
    return row.id;
  }

  it("removes a pantry row and moves the version exactly once", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);

      await asUser(tx, user);
      expect(await upsert(tx, foodId, 2, "cans", null)).toBe(1);

      const [removed] = await tx<{ version: string }[]>`
        select public.remove_pantry_item(${foodId}) as version
      `;
      expect(Number(removed.version)).toBe(2);
      expect(
        await tx<{ id: string }[]>`select id from pantry where food_id = ${foodId}`,
      ).toHaveLength(0);

      // Nothing left to remove: the version does not move.
      const [again] = await tx<{ version: string }[]>`
        select public.remove_pantry_item(${foodId}) as version
      `;
      expect(Number(again.version)).toBe(2);
    });
  });

  it("keeps one user's remove away from another user's rows", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [userA, userB]);

      await asUser(tx, userA);
      await tx`select public.upsert_pantry_item(${foodId}, 2, 'cans')`;

      // B has no row for that food: the call is a no-op on B's side and
      // never reaches A's row.
      await asUser(tx, userB);
      const [removed] = await tx<{ version: string }[]>`
        select public.remove_pantry_item(${foodId}) as version
      `;
      expect(Number(removed.version)).toBe(0);

      await tx`reset role`;
      const [aRow] =
        await tx<{ amount: string }[]>`select amount from pantry where user_id = ${userA}`;
      expect(aRow.amount).toBe("2.0000");
    });
  });

  it("checks an item off: pantry write, row delete, one bump", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);

      // A pantry row at version 1 and a stored list row for the same food.
      await asUser(tx, user);
      await tx`select public.upsert_pantry_item(${foodId}, 1, 'can')`;
      await tx`insert into shopping_list_items (user_id, food_id, source) values (${user}, ${foodId}, 'manual')`;

      const [checked] = await tx<{ version: string }[]>`
        select public.checkoff_shopping_item(${foodId}, 3, 'cans') as version
      `;
      expect(Number(checked.version)).toBe(2);

      const snap = await snapshot(tx);
      expect(snap.version).toBe(2);
      expect(snap.items).toHaveLength(1);
      expect(snap.items[0].amount).toBe(3);
      // The row cleared â€” the list cannot drift from the pantry.
      expect(snap.list.stored).toEqual([]);
    });
  });

  it("keeps amount XOR stock_state enforced on the checkoff path", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);
      await asUser(tx, user);

      const both = await failureOf(tx, () =>
        tx`select public.checkoff_shopping_item(${foodId}, 1, 'can', 'out')`,
      );
      expect(both.message).toMatch(/pantry_amount_xor_stock_state/);
    });
  });

  it("commits a meal: the row lands and the booked amounts deduct", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      const recipeId = await seedRecipe(tx);
      await seedUsers(tx, [user]);

      // Pantry at 10, doorbell at 1 (seeded state, no RPC write yet).
      await tx`insert into pantry (user_id, food_id, amount, unit) values (${user}, ${foodId}, 10, 'cans')`;
      await tx`insert into pantry_state (user_id, state_version, last_mutated_by) values (${user}, 1, 'user')`;

      await asUser(tx, user);
      const booked = [{ food_id: foodId, amount: 3, unit: "cans" }];
      const [committed] = await tx<{ result: { meal_id: string; version: number } }[]>`
        select public.commit_meal(${recipeId}, ${jsonb(booked)}::jsonb) as result
      `;
      // The RPC returns { meal_id, version } — the receipt undoes by id.
      expect(committed.result.version).toBe(2);
      expect(committed.result.meal_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      await tx`reset role`;
      const [meal] = await tx<{ booked: unknown; writer: string; undone_at: string | null }[]>`
        select booked, writer, undone_at from meals where user_id = ${user}
      `;
      expect(meal.writer).toBe("user");
      expect(meal.booked).toEqual(booked);
      expect(meal.undone_at).toBeNull();

      const [row] = await tx<{ amount: string }[]>`
        select amount from pantry where user_id = ${user}
      `;
      expect(row.amount).toBe("7.0000");
    });
  });

  it("undoes a meal exactly once: restore, flag, and a second no-op", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      const recipeId = await seedRecipe(tx);
      await seedUsers(tx, [user]);

      await tx`insert into pantry (user_id, food_id, amount, unit) values (${user}, ${foodId}, 10, 'cans')`;

      await asUser(tx, user);
      const booked = [{ food_id: foodId, amount: 4, unit: "cans" }];
      await tx`select public.commit_meal(${recipeId}, ${jsonb(booked)}::jsonb)`;

      const [undone] = await tx<{ version: string; meal_id: string }[]>`
        select public.undo_meal(m.id) as version, m.id as meal_id
        from meals m where m.user_id = auth.uid()
      `;
      // commit(1) then undo(2)
      expect(Number(undone.version)).toBe(2);

      await tx`reset role`;
      const [restored] = await tx<{ amount: string; undone_at: string | null }[]>`
        select amount, undone_at from meals m
        join pantry p on p.user_id = m.user_id
        where m.id = ${undone.meal_id}
      `;
      expect(restored.amount).toBe("10.0000");
      expect(restored.undone_at).not.toBeNull();

      // A second undo moves nothing and says so.
      await asUser(tx, user);
      const [again] = await tx<{ version: string }[]>`
        select public.undo_meal(${undone.meal_id}) as version
      `;
      expect(Number(again.version)).toBe(2);
    });
  });

  it("keeps one user's undo away from another user's meal", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      const recipeId = await seedRecipe(tx);
      await seedUsers(tx, [userA, userB]);

      await tx`insert into pantry (user_id, food_id, amount, unit) values (${userA}, ${foodId}, 10, 'cans')`;

      await asUser(tx, userA);
      await tx`select public.commit_meal(${recipeId}, ${jsonb([{ food_id: foodId, amount: 4, unit: "cans" }])}::jsonb)`;
      const [meal] = await tx<{ id: string }[]>`select id from meals`;

      await asUser(tx, userB);
      const [attempt] = await tx<{ version: string }[]>`
        select public.undo_meal(${meal.id}) as version
      `;
      // B has no doorbell to move: no-op, and A's meal stays undone_at-null.
      expect(Number(attempt.version)).toBe(0);

      await tx`reset role`;
      const [aMeal] = await tx<{ undone_at: string | null }[]>`
        select undone_at from meals where id = ${meal.id}
      `;
      expect(aMeal.undone_at).toBeNull();
      const [aRow] = await tx<{ amount: string }[]>`select amount from pantry where user_id = ${userA}`;
      expect(aRow.amount).toBe("6.0000");
    });
  });

  it("cancels a pending deletion request once, own rows only", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      await seedUsers(tx, [userA, userB]);
      await tx`insert into deletion_requests (user_id, execute_after) values (${userA}, now())`;
      await tx`insert into deletion_requests (user_id, execute_after) values (${userB}, now())`;

      // The definer function bypasses RLS â€” the internal user_id filter is
      // the ownership check, and this is where it is proved.
      await asUser(tx, userB);
      const [first] = await tx<{ cancelled: boolean }[]>`
        select public.cancel_deletion_request() as cancelled
      `;
      expect(first.cancelled).toBe(true);

      const [second] = await tx<{ cancelled: boolean }[]>`
        select public.cancel_deletion_request() as cancelled
      `;
      expect(second.cancelled).toBe(false);

      await tx`reset role`;
      const [aRequest] = await tx<{ status: string; cancelled_at: string | null }[]>`
        select status, cancelled_at from deletion_requests where user_id = ${userA}
      `;
      expect(aRequest.status).toBe("pending");
      expect(aRequest.cancelled_at).toBeNull();

      const [bRequest] = await tx<{ status: string; cancelled_at: string | null }[]>`
        select status, cancelled_at from deletion_requests where user_id = ${userB}
      `;
      expect(bRequest.status).toBe("cancelled");
      expect(bRequest.cancelled_at).not.toBeNull();
    });
  });

  it("returns the derived list inside the snapshot", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const outId = await seedGlobalFood(tx);
      const shortId = await seedGlobalFood(tx);
      const zeroId = await seedGlobalFood(tx);
      const storedId = await seedGlobalFood(tx);
      const heldId = await seedGlobalFood(tx);
      await seedUsers(tx, [user]);

      await asUser(tx, user);
      await tx`insert into pantry (user_id, food_id, stock_state) values (${user}, ${outId}, 'out')`;
      await tx`insert into pantry (user_id, food_id, stock_state) values (${user}, ${shortId}, 'short')`;
      await tx`insert into pantry (user_id, food_id, amount, unit) values (${user}, ${zeroId}, 0, 'cans')`;
      await tx`insert into pantry (user_id, food_id, amount, unit) values (${user}, ${heldId}, 5, 'jars')`;
      await tx`insert into shopping_list_items (user_id, food_id, source) values (${user}, ${storedId}, 'manual')`;

      const snap = await snapshot(tx);

      const reasons = Object.fromEntries(
        snap.list.derived.map((row) => [row.food_id, row.reason]),
      );
      expect(reasons[outId]).toBe("out");
      expect(reasons[shortId]).toBe("low");
      expect(reasons[zeroId]).toBe("out");
      // A well-stocked counted item with no meals signal is not listed.
      expect(reasons[heldId]).toBeUndefined();

      expect(snap.list.stored.map((row) => row.food_id)).toEqual([storedId]);
      expect(snap.list.stored[0].source).toBe("manual");
    });
  });

  it("counts net meals over 28 days and flags declining usage", async () => {
    const user = randomUUID();

    await inRollback(async (tx) => {
      const foodId = await seedGlobalFood(tx);
      const recipeId = await seedRecipe(tx);
      await seedUsers(tx, [user]);

      await asUser(tx, user);
      await tx`insert into pantry (user_id, food_id, amount, unit) values (${user}, ${foodId}, 5, 'cans')`;

      // Two meals inside the window, one of them undone; one older meal in
      // the prior window. Net: 1 recent vs 1 prior â€” not declining yet.
      await tx`reset role`;
      await tx`
        insert into meals (user_id, recipe_id, writer, booked, at)
        values (${user}, ${recipeId}, 'user', ${jsonb([{ food_id: foodId, amount: 1, unit: "cans" }])}::jsonb, now() - interval '3 days')
      `;
      await tx`
        insert into meals (user_id, recipe_id, writer, booked, at, undone_at)
        values (${user}, ${recipeId}, 'user', ${jsonb([{ food_id: foodId, amount: 1, unit: "cans" }])}::jsonb, now() - interval '5 days', now())
      `;
      await tx`
        insert into meals (user_id, recipe_id, writer, booked, at)
        values (${user}, ${recipeId}, 'user', ${jsonb([{ food_id: foodId, amount: 1, unit: "cans" }])}::jsonb, now() - interval '40 days')
      `;

      await asUser(tx, user);
      const before = await snapshot(tx);
      // Amount 5, net 1 recent vs 1 prior: no out/low/declining signal.
      expect(
        before.list.derived.find((row) => row.food_id === foodId),
      ).toBeUndefined();

      // Two net meals recent vs one prior: declining.
      await tx`reset role`;
      await tx`
        insert into meals (user_id, recipe_id, writer, booked, at)
        values (${user}, ${recipeId}, 'user', ${jsonb([{ food_id: foodId, amount: 1, unit: "cans" }])}::jsonb, now() - interval '2 days')
      `;

      await asUser(tx, user);
      const after = await snapshot(tx);
      const row = after.list.derived.find((item) => item.food_id === foodId);
      expect(row?.reason).toBe("declining");
      expect(row?.used_28d).toBe(2);
    });
  });

  it("scopes the trusted-callable snapshot twin by its id argument", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const foodA = await seedGlobalFood(tx);
      const foodB = await seedGlobalFood(tx);
      await seedUsers(tx, [userA, userB]);

      // A: a doorbell at 3 and two held rows. B: one row, no doorbell.
      await tx`insert into pantry_state (user_id, state_version, last_mutated_by) values (${userA}, 3, 'user')`;
      await tx`insert into pantry (user_id, food_id, amount, unit) values (${userA}, ${foodA}, 2, 'cans')`;
      await tx`insert into pantry (user_id, food_id, stock_state) values (${userA}, ${foodB}, 'short')`;
      await tx`insert into pantry (user_id, food_id, amount, unit) values (${userB}, ${foodA}, 9, 'jars')`;

      // The trusted shape: the secret key calls it with the id as argument.
      const [forA] = await tx<{ snapshot: Snapshot }[]>`
        select public.get_pantry_snapshot_for(${userA}) as snapshot
      `;
      expect(forA.snapshot.version).toBe(3);
      expect(forA.snapshot.items.map(item => item.food_id).sort()).toEqual(
        [foodA, foodB].sort(),
      );

      const [forB] = await tx<{ snapshot: Snapshot }[]>`
        select public.get_pantry_snapshot_for(${userB}) as snapshot
      `;
      expect(forB.snapshot.version).toBe(0);
      expect(forB.snapshot.items.map(item => item.food_id)).toEqual([foodA]);
      expect(forB.snapshot.items[0].amount).toBe(9);

      // The backstop: with a user token the function is still invoker, so
      // RLS filters on top of the WHERE — A's token plus B's id is the
      // empty intersection, so the twin can never be used to reach
      // another user's rows.
      await asUser(tx, userA);
      const [crossed] = await tx<{ snapshot: Snapshot }[]>`
        select public.get_pantry_snapshot_for(${userB}) as snapshot
      `;
      expect(crossed.snapshot.items).toEqual([]);
      expect(crossed.snapshot.version).toBe(0);
      expect(crossed.snapshot.list).toEqual({ derived: [], stored: [] });
    });
  });

  it("scopes the trusted-callable meals twin by its id argument", async () => {
    const userA = randomUUID();
    const userB = randomUUID();

    await inRollback(async (tx) => {
      const recipeId = await seedRecipe(tx);
      await seedUsers(tx, [userA, userB]);

      await tx`
        insert into meals (user_id, recipe_id, writer, booked)
        values (${userA}, ${recipeId}, 'user', '[]'::jsonb),
               (${userB}, ${recipeId}, 'user', '[]'::jsonb)
      `;

      const forA = await tx<{ id: string }[]>`
        select id from public.list_meals_for(${userA}, 100)
      `;
      const forB = await tx<{ id: string }[]>`
        select id from public.list_meals_for(${userB}, 100)
      `;
      expect(forA).toHaveLength(1);
      expect(forB).toHaveLength(1);
      expect(forA[0].id).not.toBe(forB[0].id);

      // The backstop: a token call is RLS-filtered on top of the WHERE.
      await asUser(tx, userA);
      const crossed = await tx<{ id: string }[]>`
        select id from public.list_meals_for(${userB}, 100)
      `;
      expect(crossed).toHaveLength(0);
    });
  });
});
