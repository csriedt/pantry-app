import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  numeric,
  pgPolicy,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

import { foods } from "./catalog";

export const pantry = pgTable(
  "pantry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 4 }),
    unit: varchar("unit", { length: 32 }),
    stockState: varchar("stock_state", {
      length: 16,
      enum: ["stocked", "short", "out"],
    }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    unique("pantry_user_id_food_id_unique").on(table.userId, table.foodId),
    check(
      "pantry_stock_state_valid",
      sql`${table.stockState} in ('stocked', 'short', 'out')`,
    ),
    check(
      "pantry_amount_xor_stock_state",
      sql`(${table.amount} is null) <> (${table.stockState} is null)`,
    ),
    pgPolicy("pantry_select_own_rows", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("pantry_insert_own_rows", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("pantry_update_own_rows", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
      withCheck: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("pantry_delete_own_rows", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
  ],
);

export const pantryState = pgTable(
  "pantry_state",
  {
    // user_id IS the primary key — one doorbell row per user (DBML: pk on
    // user_id). No surrogate id column here.
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    stateVersion: bigint("state_version", { mode: "number" })
      .notNull()
      .default(1),
    lastMutatedBy: varchar("last_mutated_by", {
      length: 20,
      enum: ["user", "ai", "cron"],
    }),
    // Tombstone: no default. It stays NULL until the RTBF purge job (service
    // role) sets it — a default now() would mark every fresh row as deleted.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "pantry_state_last_mutated_by_valid",
      sql`${table.lastMutatedBy} in ('user', 'ai', 'cron')`,
    ),
    pgPolicy("pantry_state_select_own_row", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
    // insert + update exist for the future write-intent RPC: it runs
    // SECURITY INVOKER, so the bump happens as the user and needs these.
    pgPolicy("pantry_state_insert_own_row", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("pantry_state_update_own_row", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
      withCheck: sql`${table.userId} = ${authUid}`,
    }),
  ],
);

export const shoppingListItems = pgTable(
  "shopping_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("shopping_list_items_user_id_food_id_unique").on(table.userId, table.foodId),
    pgPolicy("shopping_list_items_select_own_rows", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("shopping_list_items_insert_own_rows", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = ${authUid}`,
    }),
    // Checkoff deletes the row outright (DBML: "pantry write + row delete"),
    // so delete is granted — but not update: no column ever changes.
    pgPolicy("shopping_list_items_delete_own_rows", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
  ],
);
