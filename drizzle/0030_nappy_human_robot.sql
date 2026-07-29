ALTER TABLE "rescue_routes" ADD COLUMN "delivery_proof_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rescue_routes" ADD COLUMN "delivery_proof_pathname" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "delivery_proof_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "route_offers" ADD COLUMN "delivery_proof_pathname" text DEFAULT '' NOT NULL;