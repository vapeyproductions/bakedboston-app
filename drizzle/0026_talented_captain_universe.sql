ALTER TABLE "route_offers" ADD COLUMN "pantry_service_mode" text DEFAULT 'staffed' NOT NULL;--> statement-breakpoint
ALTER TABLE "pantry_access_photos" DROP COLUMN "pantry_service_mode";