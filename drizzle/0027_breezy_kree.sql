CREATE TABLE "support_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_type" text NOT NULL,
	"reporter_id" integer,
	"reporter_name" text DEFAULT '' NOT NULL,
	"route_offer_id" integer,
	"category" text NOT NULL,
	"urgency" text DEFAULT 'routine' NOT NULL,
	"details" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"admin_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
