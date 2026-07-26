CREATE TABLE "availability_windows" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_type" text NOT NULL,
	"organization_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
