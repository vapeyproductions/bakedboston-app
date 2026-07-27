CREATE TABLE "bakery_pickup_occurrences" (
	"id" serial PRIMARY KEY NOT NULL,
	"bakery_id" integer NOT NULL,
	"service_date" text NOT NULL,
	"pickup_window_starts_at" timestamp with time zone NOT NULL,
	"pickup_deadline" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'awaiting_confirmation' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmation_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_ride_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" integer NOT NULL,
	"service_date" text NOT NULL,
	"earliest_start" timestamp with time zone NOT NULL,
	"latest_finish" timestamp with time zone NOT NULL,
	"start_zip" text DEFAULT '' NOT NULL,
	"end_zip" text DEFAULT '' NOT NULL,
	"maximum_extra_minutes" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "in_app_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"action_required" boolean DEFAULT false NOT NULL,
	"action_key" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"pickup_occurrence_id" integer NOT NULL,
	"driver_request_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"pantry_id" integer NOT NULL,
	"rank" integer DEFAULT 1 NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"estimated_bakery_arrival" timestamp with time zone NOT NULL,
	"estimated_pantry_arrival" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"offered_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bakeries" ADD COLUMN "business_open_time" text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "bakeries" ADD COLUMN "business_close_time" text DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bakery_pickup_occurrence_unique" ON "bakery_pickup_occurrences" USING btree ("bakery_id","pickup_window_starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "route_offer_request_pickup_unique" ON "route_offers" USING btree ("driver_request_id","pickup_occurrence_id");