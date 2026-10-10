import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

import { recipes } from "./recipes";

/** Deductions actually applied at commit: [{food_id, amount, unit}]. */
type BookedDeduction = {
  food_id: string;
  amount: string;
  unit: string | null;
};

/**
 * The record for meals: append-only per user. Undo is a compensating update of
 * `undone_at` — never a delete, so there is no delete policy or grant. Manual
 * (non-meal) changes leave no row here, by decision.
 */
export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    booked: jsonb("booked").$type<BookedDeduction[]>(),
    // typed as event_writer; meals themselves are written by user | ai only
    writer: varchar("writer", {
      length: 16,
      enum: ["user", "ai", "cron"],
    }).notNull(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
  },
  (table) => [
    index("meals_user_id_at_idx").on(table.userId, table.at),
    index("meals_recipe_id_at_idx").on(table.recipeId, table.at),
    check("meals_writer_valid", sql`${table.writer} in ('user', 'ai', 'cron')`),
    pgPolicy("meals_select_own_rows", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("meals_insert_own_rows", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("meals_update_own_rows", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
      withCheck: sql`${table.userId} = ${authUid}`,
    }),
  ],
);
