CREATE TABLE "admin_inbox_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_email_id" text NOT NULL,
	"sender_email" text DEFAULT '' NOT NULL,
	"recipient_emails" text DEFAULT '[]' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'unread' NOT NULL,
	"linked_report_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_inbox_messages_external_email_unique" ON "admin_inbox_messages" USING btree ("external_email_id");