ALTER TABLE "bakeries" ADD COLUMN "formatted_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bakeries" ADD COLUMN "google_place_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bakeries" ADD COLUMN "address_validation_status" text DEFAULT 'unvalidated' NOT NULL;--> statement-breakpoint
ALTER TABLE "pantries" ADD COLUMN "formatted_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pantries" ADD COLUMN "google_place_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pantries" ADD COLUMN "address_validation_status" text DEFAULT 'unvalidated' NOT NULL;