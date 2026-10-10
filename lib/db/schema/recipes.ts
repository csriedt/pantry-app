import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { foods } from "./catalog";

/**
 * Global, immutable; revisions are new rows. Lookup-first reuse is the sink.
 *
 * The `recipe_ingredients.food_id` edge carries an invariant rather than a
 * mechanism: recipes may only reference **global** (curated) foods. A
 * user-scoped food is purged with its owner's account, and the default FK
 * action on that edge would block the purge if a recipe ever pointed at one —
 * curation promotes a food before it can be baked into a recipe.
 */
export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemsetKey: varchar("itemset_key", { length: 512 }).notNull(),
    revision: integer("revision").notNull().default(1),
    source: varchar("source", {
      length: 16,
      enum: ["corpus", "generated"],
    }).notNull(),
    title: varchar("title", { length: 255 }),
    steps: jsonb("steps"),
    // nulled on purge: the recipe keeps its shape, the author is released
    createdBy: uuid("created_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    supersededBy: uuid("superseded_by").references(
      (): AnyPgColumn => recipes.id,
    ),
  },
  (table) => [
    unique("recipes_itemset_key_revision_unique").on(
      table.itemsetKey,
      table.revision,
    ),
    index("idx_recipes_current").on(table.itemsetKey),
    check(
      "recipes_source_valid",
      sql`${table.source} in ('corpus', 'generated')`,
    ),
    pgPolicy("recipes_select_all", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
);

/**
 * Linking table. Amounts stay with the recipe, never in itemset_key. Read-only
 * to users — recipes arrive from generation (server) and are never edited.
 */
export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id),
    amount: numeric("amount", { precision: 12, scale: 4 }),
    unit: varchar("unit", { length: 32 }),
  },
  (table) => [
    unique("recipe_ingredients_recipe_id_food_id_unique").on(
      table.recipeId,
      table.foodId,
    ),
    pgPolicy("recipe_ingredients_select_all", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
);
