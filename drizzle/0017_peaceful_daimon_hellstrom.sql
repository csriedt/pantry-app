ALTER TABLE "ai_events" ALTER COLUMN "cost" SET DATA TYPE numeric(18, 12);--> statement-breakpoint
ALTER TABLE "ai_reservations" ALTER COLUMN "reserved_cost" SET DATA TYPE numeric(18, 12);