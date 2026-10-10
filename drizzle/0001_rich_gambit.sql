CREATE TABLE "pantry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"amount" numeric(12, 4),
	"unit" varchar(32),
	"stock_state" varchar(16),
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "pantry_user_id_food_id_unique" UNIQUE("user_id","food_id"),
	CONSTRAINT "pantry_stock_state_valid" CHECK ("pantry"."stock_state" in ('stocked', 'short', 'out')),
	CONSTRAINT "pantry_amount_xor_stock_state" CHECK (("pantry"."amount" is null) <> ("pantry"."stock_state" is null))
);
--> statement-breakpoint
ALTER TABLE "pantry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pantry_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"state_version" bigint DEFAULT 1 NOT NULL,
	"last_mutated_by" varchar(20),
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pantry_state_last_mutated_by_valid" CHECK ("pantry_state"."last_mutated_by" in ('user', 'ai', 'cron'))
);
--> statement-breakpoint
ALTER TABLE "pantry_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shopping_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"source" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_list_items_user_id_food_id_unique" UNIQUE("user_id","food_id")
);
--> statement-breakpoint
ALTER TABLE "shopping_list_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pantry" ADD CONSTRAINT "pantry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry" ADD CONSTRAINT "pantry_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_state" ADD CONSTRAINT "pantry_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "pantry_select_own_rows" ON "pantry" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("pantry"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pantry_insert_own_rows" ON "pantry" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("pantry"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pantry_update_own_rows" ON "pantry" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("pantry"."user_id" = (select auth.uid())) WITH CHECK ("pantry"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pantry_delete_own_rows" ON "pantry" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("pantry"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pantry_state_select_own_row" ON "pantry_state" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("pantry_state"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pantry_state_insert_own_row" ON "pantry_state" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("pantry_state"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pantry_state_update_own_row" ON "pantry_state" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("pantry_state"."user_id" = (select auth.uid())) WITH CHECK ("pantry_state"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "shopping_list_items_select_own_rows" ON "shopping_list_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("shopping_list_items"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "shopping_list_items_insert_own_rows" ON "shopping_list_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("shopping_list_items"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "shopping_list_items_delete_own_rows" ON "shopping_list_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("shopping_list_items"."user_id" = (select auth.uid()));--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "shopping_list_items" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "shopping_list_items" TO "service_role";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "pantry" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "pantry" TO "service_role";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "pantry_state" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "pantry_state" TO "service_role";--> statement-breakpoint