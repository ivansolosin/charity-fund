-- charity-fund — initial schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS support_slots (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  goal_amount integer NOT NULL DEFAULT 0,
  initial_funded_amount integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id text REFERENCES support_slots(id),
  slot_title text NOT NULL,
  participant_name text,
  email text NOT NULL,
  phone text,
  amount integer NOT NULL,
  frequency text NOT NULL,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  email text NOT NULL,
  offer_accepted boolean NOT NULL DEFAULT false,
  privacy_accepted boolean NOT NULL DEFAULT false,
  recurring_accepted boolean NOT NULL DEFAULT false,
  cancellation_terms_accepted boolean NOT NULL DEFAULT false,
  offer_version text NOT NULL,
  privacy_policy_version text NOT NULL,
  subscription_terms_version text NOT NULL,
  consent_client_timestamp timestamptz,
  consent_server_timestamp timestamptz NOT NULL DEFAULT now(),
  user_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  provider text,
  external_id text,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  status text NOT NULL DEFAULT 'created',
  provider_subscription_id text,
  provider_payment_method_id text,
  metadata_json jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_slot_id ON applications(slot_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_consents_application_id ON consents(application_id);
CREATE INDEX IF NOT EXISTS idx_payments_application_id ON payments(application_id);
