import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { recipes } from "./recipes";

/**
 * The cron artifact: one row per run, written once at completion — the INSERT
 * itself is the signal doorbell. Delta-aware: a run is written only when the
 * published set changes. Server-written; read-only to users.
 */
export const recipeTrendRuns = pgTable(
  "recipe_trend_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: varchar("scope", { length: 64 }),
    horizon: varchar("horizon", {
      length: 16,
      enum: ["trend", "all_time"],
    }).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }),
    // plain text: "ok | failed" is a note in the DBML, not a declared enum —
    // the check lands once the set is agreed
    status: varchar("status", { length: 16 }),
    error: text("error"),
  },
  (table) => [
    check(
      "recipe_trend_runs_horizon_valid",
      sql`${table.horizon} in ('trend', 'all_time')`,
    ),
    pgPolicy("recipe_trend_runs_select_all", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
);

/**
 * Per-run per-recipe metrics; the k-anonymity floor (>= 20 kitchens) is
 * applied at write. Composite PK on (run_id, recipe_id) — no surrogate id.
 */
export const recipeTrends = pgTable(
  "recipe_trends",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => recipeTrendRuns.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    cooks: integer("cooks"),
    kitchens: integer("kitchens"),
    repeatKitchens: integer("repeat_kitchens"),
    lastCookedAt: timestamp("last_cooked_at", { withTimezone: true }),
    rank: integer("rank"),
  },
  (table) => [
    primaryKey({
      name: "recipe_trends_run_id_recipe_id_pk",
      columns: [table.runId, table.recipeId],
    }),
    pgPolicy("recipe_trends_select_all", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
);
