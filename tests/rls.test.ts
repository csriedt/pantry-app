import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// RLS boundary harness — proves the policies against the real database the
// way PostgREST will exercise them: forge the Supabase claims, step down to
// `authenticated`, and assert what each identity can see and write.
//
// Every test runs inside a transaction that is always rolled back, so the
// dev database is never left with test data.
//
// Runs when DATABASE_URL is set (it lives in .env.local); without one the
// suite skips, so `npm test` stays green on machines with no database.
//
// The access-matrix assertions (catalog, pantry, list, meals, …) join with
// the first solve. The probe table below validates the harness itself.

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
