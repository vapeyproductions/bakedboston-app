ALTER TABLE "route_offers" ADD COLUMN "pickup_ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "ready_reminder_30_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "ready_reminder_25_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "ready_reminder_20_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "ready_reminder_15_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "bakery_handoff_confirmed_at" timestamp with time zone;