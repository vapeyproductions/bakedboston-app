CREATE TABLE "partner_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_type" text NOT NULL,
	"organization_id" integer NOT NULL,
	"account_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "partner_invitations_token_unique" ON "partner_invitations" USING btree ("token_hash");