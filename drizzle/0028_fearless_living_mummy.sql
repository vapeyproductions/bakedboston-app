CREATE TABLE "support_report_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"direction" text NOT NULL,
	"sender_email" text DEFAULT '' NOT NULL,
	"recipient_emails" text DEFAULT '[]' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"external_email_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_reports" ADD COLUMN "resolution_summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_reports" ADD COLUMN "unread_reply_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "support_reports" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "support_report_messages_external_email_unique" ON "support_report_messages" USING btree ("external_email_id");