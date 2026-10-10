import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Two suites live here:
//
// 1. "RLS boundary" — proves the harness itself: forged claims resolve
//    through auth.uid(), and a minimal policy isolates rows.
// 2. "RLS access matrix" — runs the real tables (categories, foods, pantry,
//    pantry_state, shopping_list_items) against the access matrix in
//    `pimp-my-pantry/SCHEMA.dbml`. Seeded auth.users rows give the FK edges
//    and auth.uid() something real to return.
//
// Both run only when DATABASE_URL is set (it lives in .env.local); without
// it they skip, so `npm test` stays green on machines with no database.
// Everything runs inside transactions that are always rolled back.
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
   * if the operation unexpectedly succeeded — matrix assertions want failures.
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
});
