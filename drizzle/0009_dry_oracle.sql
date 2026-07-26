CREATE TABLE "availability_pauses" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_type" text NOT NULL,
	"organization_id" integer NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_windows" ADD COLUMN "latest_arrival" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_windows" ADD COLUMN "paused" boolean DEFAULT false NOT NULL;