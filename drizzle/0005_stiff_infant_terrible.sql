CREATE TABLE "pantry_access_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"pantry_id" integer NOT NULL,
	"image_url" text NOT NULL,
	"pathname" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pantries" ADD COLUMN "dropoff_instructions" text DEFAULT '' NOT NULL;