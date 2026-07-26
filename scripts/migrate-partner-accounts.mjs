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
  await sql`ALTER TABLE bakeries ADD COLUMN IF NOT EXISTS dropoff_instructions text DEFAULT '' NOT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS bakery_access_photos (
      id serial PRIMARY KEY,
      bakery_id integer NOT NULL,
      image_url text NOT NULL,
      pathname text NOT NULL,
      caption text DEFAULT '' NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`ALTER TABLE pantries ADD COLUMN IF NOT EXISTS business_phone text DEFAULT '' NOT NULL`;
  await sql`ALTER TABLE pantries ADD COLUMN IF NOT EXISTS notification_phone text DEFAULT '' NOT NULL`;
  await sql`ALTER TABLE pantries ADD COLUMN IF NOT EXISTS dropoff_instructions text DEFAULT '' NOT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS pantry_access_photos (
      id serial PRIMARY KEY,
      pantry_id integer NOT NULL,
      image_url text NOT NULL,
      pathname text NOT NULL,
      caption text DEFAULT '' NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
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
  await sql`
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id serial PRIMARY KEY,
      email text NOT NULL,
      password_hash text NOT NULL,
      display_name text NOT NULL,
      is_master boolean DEFAULT false NOT NULL,
      active boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_email_unique ON admin_accounts (email)`;
  await sql`
    CREATE TABLE IF NOT EXISTS admin_invitations (
      id serial PRIMARY KEY,
      email text NOT NULL,
      token_hash text NOT NULL,
      invited_by_admin_id integer NOT NULL,
      expires_at timestamp with time zone NOT NULL,
      accepted_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS admin_invitations_token_unique ON admin_invitations (token_hash)`;
  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id serial PRIMARY KEY,
      actor_type text NOT NULL,
      actor_id integer,
      actor_name text NOT NULL,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id integer,
      entity_name text DEFAULT '' NOT NULL,
      details text DEFAULT '' NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS organization_contacts (
      id serial PRIMARY KEY,
      organization_type text NOT NULL,
      organization_id integer NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      phone text NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`
    INSERT INTO organization_contacts (organization_type, organization_id, name, email, phone)
    SELECT 'bakery', id, contact_name, contact_email, contact_phone
    FROM bakeries
    WHERE contact_name <> ''
      AND NOT EXISTS (
        SELECT 1 FROM organization_contacts c
        WHERE c.organization_type = 'bakery' AND c.organization_id = bakeries.id
      )
  `;
  await sql`
    INSERT INTO organization_contacts (organization_type, organization_id, name, email, phone)
    SELECT 'pantry', id, contact_name, contact_email, contact_phone
    FROM pantries
    WHERE contact_name <> ''
      AND NOT EXISTS (
        SELECT 1 FROM organization_contacts c
        WHERE c.organization_type = 'pantry' AND c.organization_id = pantries.id
      )
  `;
  console.log("Partner-account database migration complete.");
}
