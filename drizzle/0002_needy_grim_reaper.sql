CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"amount" numeric(12, 4),
	"unit" varchar(32),
	CONSTRAINT "recipe_ingredients_recipe_id_food_id_unique" UNIQUE("recipe_id","food_id")
);
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itemset_key" varchar(512) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"source" varchar(16) NOT NULL,
	"title" varchar(255),
	"steps" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_by" uuid,
	CONSTRAINT "recipes_itemset_key_revision_unique" UNIQUE("itemset_key","revision"),
	CONSTRAINT "recipes_source_valid" CHECK ("recipes"."source" in ('corpus', 'generated'))
);
--> statement-breakpoint
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"booked" jsonb,
	"writer" varchar(16) NOT NULL,
	"undone_at" timestamp with time zone,
	CONSTRAINT "meals_writer_valid" CHECK ("meals"."writer" in ('user', 'ai', 'cron'))
);
--> statement-breakpoint
ALTER TABLE "meals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recipe_trend_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(64),
	"horizon" varchar(16) NOT NULL,
	"computed_at" timestamp with time zone,
	"status" varchar(16),
	"error" text,
	CONSTRAINT "recipe_trend_runs_horizon_valid" CHECK ("recipe_trend_runs"."horizon" in ('trend', 'all_time'))
);
--> statement-breakpoint
ALTER TABLE "recipe_trend_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recipe_trends" (
	"run_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"cooks" integer,
	"kitchens" integer,
	"repeat_kitchens" integer,
	"last_cooked_at" timestamp with time zone,
	"rank" integer,
	CONSTRAINT "recipe_trends_run_id_recipe_id_pk" PRIMARY KEY("run_id","recipe_id")
);
--> statement-breakpoint
ALTER TABLE "recipe_trends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"model" varchar(255) NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_tokens" integer NOT NULL,
	"cost" numeric(12, 6) NOT NULL,
	"rates" jsonb NOT NULL,
	"reservation_id" uuid
);
--> statement-breakpoint
ALTER TABLE "ai_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" varchar(255) NOT NULL,
	"rates" jsonb,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ai_models_model_unique" UNIQUE("model")
);
--> statement-breakpoint
ALTER TABLE "ai_models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reserved_cost" numeric(12, 6) NOT NULL,
	"status" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "ai_reservations_status_valid" CHECK ("ai_reservations"."status" in ('reserved', 'settled', 'released'))
);
--> statement-breakpoint
ALTER TABLE "ai_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"execute_after" timestamp with time zone,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"purge_counts" jsonb,
	CONSTRAINT "deletion_requests_status_valid" CHECK ("deletion_requests"."status" in ('pending', 'cancelled', 'done'))
);
--> statement-breakpoint
ALTER TABLE "deletion_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_superseded_by_recipes_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_trends" ADD CONSTRAINT "recipe_trends_run_id_recipe_trend_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."recipe_trend_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_trends" ADD CONSTRAINT "recipe_trends_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_reservation_id_ai_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."ai_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reservations" ADD CONSTRAINT "ai_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_recipes_current" ON "recipes" USING btree ("itemset_key");--> statement-breakpoint
CREATE INDEX "meals_user_id_at_idx" ON "meals" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "meals_recipe_id_at_idx" ON "meals" USING btree ("recipe_id","at");--> statement-breakpoint
CREATE INDEX "ai_events_user_id_at_idx" ON "ai_events" USING btree ("user_id","at");--> statement-breakpoint
CREATE POLICY "recipe_ingredients_select_all" ON "recipe_ingredients" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "recipes_select_all" ON "recipes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "meals_select_own_rows" ON "meals" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("meals"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "meals_insert_own_rows" ON "meals" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("meals"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "meals_update_own_rows" ON "meals" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("meals"."user_id" = (select auth.uid())) WITH CHECK ("meals"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "recipe_trend_runs_select_all" ON "recipe_trend_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "recipe_trends_select_all" ON "recipe_trends" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "deletion_requests_select_own" ON "deletion_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("deletion_requests"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "deletion_requests_insert_own" ON "deletion_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("deletion_requests"."user_id" = (select auth.uid()));--> statement-breakpoint
GRANT SELECT ON TABLE "recipe_ingredients" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "recipe_ingredients" TO "service_role";--> statement-breakpoint
GRANT SELECT ON TABLE "recipes" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "recipes" TO "service_role";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "meals" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "meals" TO "service_role";--> statement-breakpoint
GRANT SELECT ON TABLE "recipe_trend_runs" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "recipe_trend_runs" TO "service_role";--> statement-breakpoint
GRANT SELECT ON TABLE "recipe_trends" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "recipe_trends" TO "service_role";--> statement-breakpoint
GRANT ALL ON TABLE "ai_models" TO "service_role";--> statement-breakpoint
GRANT ALL ON TABLE "ai_events" TO "service_role";--> statement-breakpoint
GRANT ALL ON TABLE "ai_reservations" TO "service_role";--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "deletion_requests" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "deletion_requests" TO "service_role";--> statement-breakpoint