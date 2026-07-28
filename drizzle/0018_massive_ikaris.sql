ALTER TABLE "route_offers" ADD COLUMN "driver_confirmation_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "driver_confirmation_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "driver_confirmation_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "driver_confirmed_at" timestamp with time zone;