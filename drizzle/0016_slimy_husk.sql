ALTER TABLE "route_offers" ADD COLUMN "delivery_stage" text DEFAULT 'reserved' NOT NULL;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "arrived_at_bakery_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "picked_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "arrived_at_pantry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "completed_at" timestamp with time zone;