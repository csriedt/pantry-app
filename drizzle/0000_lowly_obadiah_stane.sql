CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(128) NOT NULL,
	"label" varchar(128) NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"parent_id" uuid,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(16) NOT NULL,
	"owner_id" uuid,
	"canonical_name" varchar(255) NOT NULL,
	"normalized_name" varchar(255) NOT NULL,
	"aliases" text[],
	"category_id" uuid,
	"source" varchar(64),
	"slug" varchar(128),
	"density_g_per_ml" numeric(8, 4),
	"pack_sizes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_scope_owner_normalized_unique" UNIQUE NULLS NOT DISTINCT("scope","owner_id","normalized_name"),
	CONSTRAINT "foods_scope_valid" CHECK ("foods"."scope" in ('global', 'user')),
	CONSTRAINT "foods_owner_matches_scope" CHECK (("foods"."scope" = 'global' and "foods"."owner_id" is null) or ("foods"."scope" = 'user' and "foods"."owner_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "foods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "categories_select_all" ON "categories" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "foods_select_global_or_own" ON "foods" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("foods"."scope" = 'global' or "foods"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "foods_insert_own_user_row" ON "foods" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("foods"."scope" = 'user' and "foods"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "foods_update_own_user_row" ON "foods" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("foods"."scope" = 'user' and "foods"."owner_id" = (select auth.uid())) WITH CHECK ("foods"."scope" = 'user' and "foods"."owner_id" = (select auth.uid()));--> statement-breakpoint
GRANT SELECT ON TABLE "categories" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "categories" TO "service_role";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "foods" TO "authenticated";--> statement-breakpoint
GRANT ALL ON TABLE "foods" TO "service_role";--> statement-breakpoint
