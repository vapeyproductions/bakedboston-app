CREATE TABLE "push_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" integer NOT NULL,
	"expo_push_token" text NOT NULL,
	"platform" text DEFAULT 'unknown' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_accounts" ADD COLUMN "last_latitude" double precision;--> statement-breakpoint
ALTER TABLE "driver_accounts" ADD COLUMN "last_longitude" double precision;--> statement-breakpoint
ALTER TABLE "driver_accounts" ADD COLUMN "last_location_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD COLUMN "push_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "push_devices_token_unique" ON "push_devices" USING btree ("expo_push_token");