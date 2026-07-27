ALTER TABLE "driver_accounts" ADD COLUMN "home_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_accounts" ADD COLUMN "date_of_birth" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_accounts" ADD COLUMN "identity_verification_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_accounts" ADD COLUMN "identity_verification_reference" text DEFAULT '' NOT NULL;