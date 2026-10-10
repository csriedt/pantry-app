import { sql } from "drizzle-orm";
import {
  check,
  jsonb,
  pgPolicy,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

/**
 * The RTBF run log lives here — no separate runs table. Requesting happens as
 * the user; the access matrix grants R/insert only, so cancelling waits on
 * the RPC branch — an invoker cancel needs an update policy + grant, a
 * definer cancel needs neither. The purge fields (`purged_at`,
 * `purge_counts`) are written by the service role either way. Purged with the
 * owner's account.
 */
export const deletionRequests = pgTable(
  "deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    executeAfter: timestamp("execute_after", { withTimezone: true }),
    status: varchar("status", {
      length: 16,
      enum: ["pending", "cancelled", "done"],
    })
      .notNull()
      .default("pending"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    purgeCounts: jsonb("purge_counts"),
  },
  (table) => [
    check(
      "deletion_requests_status_valid",
      sql`${table.status} in ('pending', 'cancelled', 'done')`,
    ),
    pgPolicy("deletion_requests_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("deletion_requests_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = ${authUid}`,
    }),
  ],
);
