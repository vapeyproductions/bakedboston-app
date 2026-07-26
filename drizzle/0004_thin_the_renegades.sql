CREATE TABLE "organization_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_type" text NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
