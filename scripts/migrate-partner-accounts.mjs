import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("DATABASE_URL is not set; skipping partner-account migration.");
} else {
  const sql = neon(databaseUrl);
  await sql`
    CREATE TABLE IF NOT EXISTS partner_accounts (
      id serial PRIMARY KEY,
      organization_type text NOT NULL,
      organization_id integer NOT NULL,
      account_email text NOT NULL,
      password_hash text NOT NULL,
      administrator_name text NOT NULL,
      contact_email text NOT NULL,
      contact_phone text NOT NULL,
      active boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`ALTER TABLE bakeries ADD COLUMN IF NOT EXISTS business_phone text DEFAULT '' NOT NULL`;
  await sql`ALTER TABLE bakeries ADD COLUMN IF NOT EXISTS notification_phone text DEFAULT '' NOT NULL`;
  await sql`ALTER TABLE pantries ADD COLUMN IF NOT EXISTS business_phone text DEFAULT '' NOT NULL`;
  await sql`ALTER TABLE pantries ADD COLUMN IF NOT EXISTS notification_phone text DEFAULT '' NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS partner_accounts_email_unique ON partner_accounts (account_email)`;
  await sql`
    CREATE TABLE IF NOT EXISTS partner_invitations (
      id serial PRIMARY KEY,
      organization_type text NOT NULL,
      organization_id integer NOT NULL,
      account_email text NOT NULL,
      token_hash text NOT NULL,
      expires_at timestamp with time zone NOT NULL,
      accepted_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS partner_invitations_token_unique ON partner_invitations (token_hash)`;
  console.log("Partner-account database migration complete.");
}
