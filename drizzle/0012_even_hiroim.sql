CREATE TABLE "mobile_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"role" text NOT NULL,
	"account_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_accounts" ADD COLUMN "password_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_accounts" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_accounts" ADD COLUMN "home_zip" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_sessions_token_unique" ON "mobile_sessions" USING btree ("token_hash");