CREATE TABLE "schedule_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_type" text NOT NULL,
	"organization_id" integer NOT NULL,
	"exception_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
