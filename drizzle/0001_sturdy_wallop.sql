CREATE TABLE "partner_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_type" text NOT NULL,
	"organization_id" integer NOT NULL,
	"account_email" text NOT NULL,
	"password_hash" text NOT NULL,
	"administrator_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bakeries" ADD COLUMN "business_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bakeries" ADD COLUMN "notification_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pantries" ADD COLUMN "business_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pantries" ADD COLUMN "notification_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_accounts_email_unique" ON "partner_accounts" USING btree ("account_email");