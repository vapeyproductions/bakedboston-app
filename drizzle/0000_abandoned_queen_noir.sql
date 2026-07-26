CREATE TABLE "bakeries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"recurring_days" text NOT NULL,
	"ready_time" text NOT NULL,
	"arrival_deadline" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"recurring_days" text NOT NULL,
	"open_time" text NOT NULL,
	"close_time" text NOT NULL,
	"latest_arrival" text NOT NULL,
	"deliveries_seven_days" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rescue_routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"bakery_name" text NOT NULL,
	"pantry_name" text NOT NULL,
	"driver_name" text DEFAULT 'Unassigned' NOT NULL,
	"scheduled_arrival" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
