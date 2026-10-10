import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

/**
 * Rate card. Current rates only — historical spend is reconstructable from
 * per-event snapshots. Server-only: no policies, no authenticated grants.
 */
export const aiModels = pgTable(
  "ai_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    model: varchar("model", { length: 255 }).notNull(),
    rates: jsonb("rates"),
    currency: varchar("currency", { length: 8 }).notNull().default("USD"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [unique("ai_models_model_unique").on(table.model)],
).enableRLS();

/**
 * Operational holds. Only settled rows become ai_events; open holds count
 * against quota. Purged with the owner's account (RTBF purge bucket).
 *
 * Status carries the DBML's `ai_event_status` values (reserved | settled |
 * released); the per-table note in the DBML says "open", which reads as the
 * same first state under an older name.
 */
export const aiReservations = pgTable(
  "ai_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    reservedCost: numeric("reserved_cost", { precision: 12, scale: 6 }).notNull(),
    status: varchar("status", {
      length: 16,
      enum: ["reserved", "settled", "released"],
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "ai_reservations_status_valid",
      sql`${table.status} in ('reserved', 'settled', 'released')`,
    ),
  ],
).enableRLS();

/**
 * Append-only financial record: settled facts only. Quota = settled sums +
 * open reservations. Server-only — a user-facing usage meter must not expose
 * this table (aggregate RPC or a service-written counter row instead).
 *
 * Both user references null on purge: the record survives as the single
 * anonymous bucket, and the hold link nulls rather than blocking the
 * reservation purge.
 */
export const aiEvents = pgTable(
  "ai_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    userId: uuid("user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    model: varchar("model", { length: 255 }).notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheTokens: integer("cache_tokens").notNull(),
    cost: numeric("cost", { precision: 12, scale: 6 }).notNull(),
    rates: jsonb("rates").notNull(),
    reservationId: uuid("reservation_id").references(() => aiReservations.id, {
      onDelete: "set null",
    }),
  },
  (table) => [index("ai_events_user_id_at_idx").on(table.userId, table.at)],
).enableRLS();
