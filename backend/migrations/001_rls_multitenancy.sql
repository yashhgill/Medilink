-- MediLink — cloud node multi-tenancy via Row-Level Security
--
-- Run this ONCE against the Neon cloud database, AFTER 000_schema.sql.
-- Safe to re-run.
--
-- ── What this does, and why ──────────────────────────────────────────────────
--
-- Every clinic's rows live in one database, separated by facility_id and
-- enforced by Postgres itself rather than by application code. Application-level
-- filtering is one forgotten WHERE clause away from showing Clinic A the
-- patients of Clinic B. With RLS, that forgotten clause returns zero rows
-- instead of someone else's medical history.
--
-- The app sets one session variable per connection:
--     SET app.facility_id = 'melaka-01';
-- and every policy below keys off it. A connection that never set it gets NULL,
-- and every policy fails closed against NULL.
--
-- ── The deliberate exception: shared patient records ─────────────────────────
--
-- Cross-clinic record sharing is the whole point of Connect, so a strict
-- facility boundary on clinical tables would break the product. The boundary is
-- drawn where it actually matters instead:
--
--   • operational rows (queue, money, dispensing, stock, audit) are HARD
--     isolated. Clinic A can never see Clinic B's till.
--   • clinical rows are readable across clinics ONLY for a patient this clinic
--     has been granted access to, via record_consents.
--
-- Break-glass is not a separate table: it is a record_consents row with
-- mode='break_glass', already audited by the application.

BEGIN;

-- ── 0. the facility of the current connection ────────────────────────────────
CREATE OR REPLACE FUNCTION app_facility() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.facility_id', true), '')
$$;

-- ── 1. safe timestamp parsing ────────────────────────────────────────────────
-- expires_at is stored as VARCHAR (ISO-8601 from the app), so it MUST be cast
-- rather than string-compared. Comparing text to now()::text looks like it
-- works and does not: the app writes "2026-08-09T12:00:00+00:00" while
-- now()::text renders "2026-08-09 12:00:00+00", and 'T' sorts above ' ', so an
-- expired consent would compare as still valid. That bug would silently grant
-- access to records after consent lapsed.
--
-- Unparseable input returns NULL, and NULL is treated as EXPIRED below, so a
-- malformed timestamp denies access rather than granting it.
CREATE OR REPLACE FUNCTION app_ts(s text) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN s::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- ── 2. may this facility see this patient right now? ─────────────────────────
CREATE OR REPLACE FUNCTION app_may_access_patient(p_patient_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT
    -- the patient is registered at this clinic
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = p_patient_id
        AND u.facility_id = app_facility()
    )
    OR
    -- or this clinic holds a granted, unexpired consent.
    -- Covers break-glass too: those are rows with mode='break_glass'.
    EXISTS (
      SELECT 1 FROM record_consents c
      WHERE c.patient_id = p_patient_id
        AND c.requesting_facility = app_facility()
        AND c.granted IS TRUE
        AND (c.expires_at IS NULL OR app_ts(c.expires_at) > now())
    )
$$;

-- ── 3. hard-isolated operational tables ──────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointments', 'payments', 'dispense_records',
    'pharmacy_inventory', 'stock_movements', 'audit_logs'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = t AND table_schema = 'public') THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      EXECUTE format($f$
        CREATE POLICY tenant_isolation ON %I
        USING (facility_id = app_facility())
        WITH CHECK (facility_id = app_facility())
      $f$, t);
      RAISE NOTICE 'RLS (hard isolation): %', t;
    ELSE
      RAISE NOTICE 'skipped (missing): %', t;
    END IF;
  END LOOP;
END $$;

-- ── 4. clinical tables: own clinic, or consented ─────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'medical_records', 'vaccinations', 'attachments', 'lab_orders'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = t AND table_schema = 'public') THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_read ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_write ON %I', t);
      EXECUTE format($f$
        CREATE POLICY tenant_read ON %I
        FOR SELECT
        USING (facility_id = app_facility() OR app_may_access_patient(patient_id))
      $f$, t);
      -- Consent grants READ across clinics, never WRITE. Clinic B must not be
      -- able to edit or delete a record Clinic A authored.
      EXECUTE format($f$
        CREATE POLICY tenant_write ON %I
        FOR ALL
        USING (facility_id = app_facility())
        WITH CHECK (facility_id = app_facility())
      $f$, t);
      RAISE NOTICE 'RLS (consent-aware): %', t;
    ELSE
      RAISE NOTICE 'skipped (missing): %', t;
    END IF;
  END LOOP;
END $$;

-- ── 5. users: own clinic, or a patient we have consent for ───────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON users;
DROP POLICY IF EXISTS tenant_write ON users;

CREATE POLICY tenant_read ON users
  FOR SELECT
  USING (
    facility_id = app_facility()
    OR (role = 'patient' AND app_may_access_patient(id))
  );

CREATE POLICY tenant_write ON users
  FOR ALL
  USING (facility_id = app_facility())
  WITH CHECK (facility_id = app_facility());

-- ── 6. record_consents: both sides must see the grant ────────────────────────
-- The requesting clinic needs to see that it holds one; the patient's home
-- clinic needs to see who they granted access to.
ALTER TABLE record_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_consents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_read ON record_consents;
DROP POLICY IF EXISTS consent_write ON record_consents;

CREATE POLICY consent_read ON record_consents
  FOR SELECT
  USING (
    requesting_facility = app_facility()
    OR EXISTS (SELECT 1 FROM users u
               WHERE u.id = record_consents.patient_id
                 AND u.facility_id = app_facility())
  );

-- A clinic may only create or modify consent requests in its OWN name, so no
-- clinic can forge a grant to itself on behalf of another.
CREATE POLICY consent_write ON record_consents
  FOR ALL
  USING (requesting_facility = app_facility())
  WITH CHECK (requesting_facility = app_facility());

-- ── 7. facilities: public directory, own row writable ────────────────────────
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facilities_read ON facilities;
DROP POLICY IF EXISTS facilities_write ON facilities;
CREATE POLICY facilities_read ON facilities FOR SELECT USING (true);
CREATE POLICY facilities_write ON facilities FOR ALL
  USING (code = app_facility()) WITH CHECK (code = app_facility());

-- counters and sync_queue are per-node bookkeeping with no facility column and
-- no patient data. They are intentionally left without policies.

-- ── 8. indexes: RLS predicates run on EVERY row read ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_facility       ON users (facility_id);
CREATE INDEX IF NOT EXISTS idx_users_ic_hash        ON users (ic_hash);
CREATE INDEX IF NOT EXISTS idx_users_role_id        ON users (role, id);
CREATE INDEX IF NOT EXISTS idx_records_facility     ON medical_records (facility_id);
CREATE INDEX IF NOT EXISTS idx_records_patient      ON medical_records (patient_id);
CREATE INDEX IF NOT EXISTS idx_vacc_patient         ON vaccinations (patient_id);
CREATE INDEX IF NOT EXISTS idx_attach_patient       ON attachments (patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_patient          ON lab_orders (patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_facility        ON appointments (facility_id);
CREATE INDEX IF NOT EXISTS idx_pay_facility         ON payments (facility_id);
CREATE INDEX IF NOT EXISTS idx_consent_lookup
  ON record_consents (patient_id, requesting_facility, granted);

COMMIT;

-- ── 9. the application role ──────────────────────────────────────────────────
-- Run this too. It is not optional.
--
-- A role that OWNS the tables, or has BYPASSRLS, silently ignores every policy
-- above and makes this whole file decorative. That failure is invisible: sync
-- keeps working perfectly while the isolation guarantee is fiction.
--
--   CREATE ROLE harnova_app LOGIN PASSWORD '<a long random password>';
--   GRANT CONNECT ON DATABASE neondb TO harnova_app;
--   GRANT USAGE ON SCHEMA public TO harnova_app;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO harnova_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO harnova_app;
--
-- Point CLOUD_DATABASE_URL at harnova_app, then verify:
--   SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'harnova_app';
--   -- both must be false
