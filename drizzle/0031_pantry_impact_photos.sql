CREATE TABLE "pantry_impact_photos" (
  "id" serial PRIMARY KEY NOT NULL,
  "pantry_id" integer NOT NULL,
  "rescue_route_id" integer NOT NULL,
  "image_url" text NOT NULL,
  "pathname" text NOT NULL,
  "caption" text DEFAULT '' NOT NULL,
  "social_consent" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
