ALTER TABLE "route_offers" ADD COLUMN "departure_window_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "departure_window_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "departure_opening_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "departure_opened_notification_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "departure_closing_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "departure_ended_notification_sent_at" timestamp with time zone;