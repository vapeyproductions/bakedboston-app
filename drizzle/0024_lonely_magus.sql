ALTER TABLE "availability_windows" ADD COLUMN "service_mode" text DEFAULT 'staffed' NOT NULL;--> statement-breakpoint
ALTER TABLE "pantries" ADD COLUMN "service_modes" text DEFAULT '[]' NOT NULL;