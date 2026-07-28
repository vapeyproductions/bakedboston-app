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
  await sql`ALTER TABLE bakeries ADD COLUMN IF NOT EXISTS formatted_address text DEFAULT '' NOT NULL`;
  await sql`ALTER TABLE bakeries ADD COLUMN IF NOT EXISTS google_place_id text DEFAULT '' NOT NULL`;
  await sql`ALTER TABLE bakeries ADD COLUMN IF NOT EXISTS address_validation_status text DEFAULT 'unvalidated' NOT NULL`;
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
  await sql`ALTER TABLE pantries ADD COLUMN IF NOT EXISTS formatted_address text DEFAULT '' NOT NULL`;
  await sql`ALTER TABLE pantries ADD COLUMN IF NOT EXISTS google_place_id text DEFAULT '' NOT NULL`;
  await sql`ALTER TABLE pantries ADD COLUMN IF NOT EXISTS address_validation_status text DEFAULT 'unvalidated' NOT NULL`;
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
  await sql`
    CREATE TABLE IF NOT EXISTS availability_windows (
      id serial PRIMARY KEY,
      organization_type text NOT NULL,
      organization_id integer NOT NULL,
      starts_at timestamp with time zone NOT NULL,
      ends_at timestamp with time zone NOT NULL,
      latest_arrival timestamp with time zone NOT NULL,
      paused boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`ALTER TABLE availability_windows ADD COLUMN IF NOT EXISTS latest_arrival timestamp with time zone`;
  await sql`UPDATE availability_windows SET latest_arrival = ends_at WHERE latest_arrival IS NULL`;
  await sql`ALTER TABLE availability_windows ALTER COLUMN latest_arrival SET NOT NULL`;
  await sql`ALTER TABLE availability_windows ADD COLUMN IF NOT EXISTS paused boolean DEFAULT false NOT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS availability_pauses (
      id serial PRIMARY KEY,
      organization_type text NOT NULL,
      organization_id integer NOT NULL,
      ends_at timestamp with time zone NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS partner_accounts_email_unique ON partner_accounts (account_email)`;
  await sql`
    CREATE TABLE IF NOT EXISTS driver_accounts (
      id serial PRIMARY KEY,
      email text NOT NULL,
      display_name text NOT NULL,
      active boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS driver_accounts_email_unique ON driver_accounts (email)`;
  await sql`
    CREATE TABLE IF NOT EXISTS schedule_exceptions (
      id serial PRIMARY KEY,
      organization_type text NOT NULL,
      organization_id integer NOT NULL,
      exception_date text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS home_address text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS home_zip text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS date_of_birth text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS identity_verification_status text NOT NULL DEFAULT 'not_started'`;
  await sql`ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS identity_verification_reference text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE bakeries ADD COLUMN IF NOT EXISTS business_open_time text NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE bakeries ADD COLUMN IF NOT EXISTS business_close_time text NOT NULL DEFAULT '{}'`;
  await sql`
    CREATE TABLE IF NOT EXISTS bakery_pickup_occurrences (
      id serial PRIMARY KEY,
      bakery_id integer NOT NULL,
      service_date text NOT NULL,
      pickup_window_starts_at timestamptz NOT NULL,
      pickup_deadline timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'awaiting_confirmation',
      confirmed_at timestamptz,
      confirmation_note text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS bakery_pickup_occurrence_unique ON bakery_pickup_occurrences (bakery_id, pickup_window_starts_at)`;
  await sql`
    CREATE TABLE IF NOT EXISTS driver_ride_requests (
      id serial PRIMARY KEY,
      driver_id integer NOT NULL,
      service_date text NOT NULL,
      earliest_start timestamptz NOT NULL,
      latest_finish timestamptz NOT NULL,
      start_zip text NOT NULL DEFAULT '',
      end_zip text NOT NULL DEFAULT '',
      maximum_extra_minutes integer,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS route_offers (
      id serial PRIMARY KEY,
      pickup_occurrence_id integer NOT NULL,
      driver_request_id integer NOT NULL,
      driver_id integer NOT NULL,
      pantry_id integer NOT NULL,
      rank integer NOT NULL DEFAULT 1,
      score double precision NOT NULL DEFAULT 0,
      estimated_bakery_arrival timestamptz NOT NULL,
      estimated_pantry_arrival timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'queued',
      offered_at timestamptz,
      expires_at timestamptz,
      responded_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS route_offer_request_pickup_unique ON route_offers (driver_request_id, pickup_occurrence_id)`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS delivery_stage text NOT NULL DEFAULT 'reserved'`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS arrived_at_bakery_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS picked_up_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS arrived_at_pantry_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS completed_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS departure_window_starts_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS departure_window_ends_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS departure_opening_reminder_sent_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS departure_opened_notification_sent_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS departure_closing_reminder_sent_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS departure_ended_notification_sent_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS driver_confirmation_due_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS driver_confirmation_deadline_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS driver_confirmation_requested_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS driver_confirmed_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS pickup_ready_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS ready_reminder_30_sent_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS ready_reminder_25_sent_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS ready_reminder_20_sent_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS ready_reminder_15_sent_at timestamptz`;
  await sql`ALTER TABLE route_offers ADD COLUMN IF NOT EXISTS bakery_handoff_confirmed_at timestamptz`;
  await sql`ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS last_latitude double precision`;
  await sql`ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS last_longitude double precision`;
  await sql`ALTER TABLE driver_accounts ADD COLUMN IF NOT EXISTS last_location_at timestamptz`;
  await sql`ALTER TABLE in_app_notifications ADD COLUMN IF NOT EXISTS push_sent_at timestamptz`;
  await sql`CREATE TABLE IF NOT EXISTS push_devices (
    id serial PRIMARY KEY,
    recipient_type text NOT NULL,
    recipient_id integer NOT NULL,
    expo_push_token text NOT NULL,
    platform text NOT NULL DEFAULT 'unknown',
    active boolean NOT NULL DEFAULT true,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS push_devices_token_unique ON push_devices (expo_push_token)`;
  await sql`
    CREATE TABLE IF NOT EXISTS in_app_notifications (
      id serial PRIMARY KEY,
      recipient_type text NOT NULL,
      recipient_id integer NOT NULL,
      event_type text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      action_required boolean NOT NULL DEFAULT false,
      action_key text NOT NULL DEFAULT '',
      read_at timestamptz,
      acknowledged_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS mobile_sessions (
      id serial PRIMARY KEY,
      token_hash text NOT NULL,
      role text NOT NULL,
      account_id integer NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS mobile_sessions_token_unique ON mobile_sessions (token_hash)`;
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
      is_primary boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`ALTER TABLE organization_contacts ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false NOT NULL`;
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
  await sql`
    UPDATE organization_contacts c
    SET is_primary = true
    WHERE c.id = (
      SELECT first_contact.id FROM organization_contacts first_contact
      WHERE first_contact.organization_type = c.organization_type
        AND first_contact.organization_id = c.organization_id
      ORDER BY first_contact.created_at, first_contact.id
      LIMIT 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM organization_contacts existing
      WHERE existing.organization_type = c.organization_type
        AND existing.organization_id = c.organization_id
        AND existing.is_primary = true
    )
  `;
  console.log("Partner-account database migration complete.");
}
