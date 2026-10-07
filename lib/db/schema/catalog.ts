import { sql } from "drizzle-orm";
import {
 type AnyPgColumn,
 check,
 integer,
 jsonb,
 numeric,
 pgPolicy,
 pgTable,
 text,
 timestamp,
 unique,
 uuid,
 varchar,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

export const categories = pgTable(
 "categories",
 {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 128 }).notNull(),
  label: varchar("label", { length: 128 }).notNull(),
  sort: integer("sort").notNull().default(0),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
 },
 (table) => [
  unique("categories_slug_unique").on(table.slug),
  pgPolicy("categories_select_all", {
   for: "select",
   to: authenticatedRole,
   using: sql`true`,
  }),
 ],
);

export const foods = pgTable(
 "foods",
 {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: varchar("scope", { length: 16, enum: ["global", "user"] }).notNull(),
  // Deleting cascade here only when an owner exists - in other words when scope is user/food hasn't been promoted to global yet
  ownerId: uuid("owner_id").references(() => authUsers.id, {
   onDelete: "cascade",
  }),
  canonicalName: varchar("canonical_name", { length: 255 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
  aliases: text("aliases").array(),
  categoryId: uuid("category_id").references(() => categories.id),
  source: varchar("source", { length: 64 }),
  slug: varchar("slug", { length: 128 }),
  densityGPerMl: numeric("density_g_per_ml", { precision: 8, scale: 4 }),
  packSizes: jsonb("pack_sizes"),
  createdAt: timestamp("created_at", { withTimezone: true })
   .notNull()
   .defaultNow(),
 },
 (table) => [
  check("foods_scope_valid", sql`${table.scope} in ('global', 'user')`),
  check(
   "foods_owner_matches_scope",
   sql`(${table.scope} = 'global' and ${table.ownerId} is null) or (${table.scope} = 'user' and ${table.ownerId} is not null)`,
  ),
  unique("foods_scope_owner_normalized_unique")
   .on(table.scope, table.ownerId, table.normalizedName)
   .nullsNotDistinct(),
  pgPolicy("foods_select_global_or_own", {
   for: "select",
   to: authenticatedRole,
   using: sql`${table.scope} = 'global' or ${table.ownerId} = ${authUid}`,
  }),
  pgPolicy("foods_insert_own_user_row", {
   for: "insert",
   to: authenticatedRole,
   withCheck: sql`${table.scope} = 'user' and ${table.ownerId} = ${authUid}`,
  }),
  pgPolicy("foods_update_own_user_row", {
   for: "update",
   to: authenticatedRole,
   using: sql`${table.scope} = 'user' and ${table.ownerId} = ${authUid}`,
   withCheck: sql`${table.scope} = 'user' and ${table.ownerId} = ${authUid}`,
  }),
 ],
);
