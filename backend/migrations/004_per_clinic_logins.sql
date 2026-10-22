-- ═══════════════════════════════════════════════════════════════════════════
--  MediLink cloud node: one database login per clinic.
--
--  Under 002 every clinic connected as the shared role medilink_app and told
--  the database which clinic it was (SET app.facility_id). Row-level security
--  then held, but only as long as every clinic told the truth: anyone holding
--  the shared password could claim to be any clinic.
--
--  With real clinics on the cloud, the database must decide which clinic a
--  connection belongs to. Each clinic now gets its own login, recorded in
--  medilink.clinic_logins, and current_facility() answers from that record.
--  A clinic login cannot choose its facility; a login that is a clinic but has
--  no record sees nothing (fails closed). medilink_app keeps working as before
--  for the single-clinic demo and the test suite.
--
--  Apply after 002 and 003:
--      psql "$CLOUD_ADMIN_URL" -f 004_per_clinic_logins.sql
--  Then create each clinic's login with medilink.provision_clinic(...)
--  (see tools/provision_clinic.py), as the project owner.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Which login is which clinic ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medilink.clinic_logins (
  role_name   text PRIMARY KEY,
  facility_id text NOT NULL UNIQUE,
  clinic_name text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Readable only by its owner and the SECURITY DEFINER functions below.
ALTER TABLE medilink.clinic_logins ENABLE ROW LEVEL SECURITY;
ALTER TABLE medilink.clinic_logins FORCE  ROW LEVEL SECURITY;

-- ── 2. The group every clinic login belongs to ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medilink_clinic') THEN
    CREATE ROLE medilink_clinic NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA medilink TO medilink_clinic;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA medilink TO medilink_clinic;
ALTER DEFAULT PRIVILEGES IN SCHEMA medilink
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO medilink_clinic;
REVOKE ALL ON medilink.clinic_logins FROM medilink_clinic, medilink_app;
REVOKE ALL ON SCHEMA public FROM medilink_clinic;

-- ── 3. The database, not the clinic, decides the facility ──────────────────
-- SECURITY DEFINER so it can read clinic_logins; session_user is still the
-- login that connected. A clinic login's set_config('app.facility_id') is
-- ignored entirely.
CREATE OR REPLACE FUNCTION medilink.current_facility() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = medilink, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM medilink.clinic_logins WHERE role_name = session_user)
      THEN (SELECT facility_id FROM medilink.clinic_logins WHERE role_name = session_user)
    WHEN pg_has_role(session_user, 'medilink_clinic', 'MEMBER')
      THEN NULL                                   -- a clinic login with no record: nothing
    ELSE NULLIF(current_setting('app.facility_id', true), '')
  END
$$;
REVOKE ALL ON FUNCTION medilink.current_facility() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION medilink.current_facility() TO medilink_app, medilink_clinic;
GRANT EXECUTE ON FUNCTION medilink.find_patient_facilities(text) TO medilink_clinic;
GRANT EXECUTE ON FUNCTION medilink.records_with_consent(text)   TO medilink_clinic;
GRANT EXECUTE ON FUNCTION medilink.app_ts(text)                  TO medilink_clinic;

-- ── 4. Creating a clinic's login (project owner only) ──────────────────────
CREATE OR REPLACE FUNCTION medilink.provision_clinic(p_facility text, p_name text, p_password text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = medilink, pg_temp
AS $$
DECLARE
  r text;
BEGIN
  IF p_facility !~ '^[a-z0-9][a-z0-9_-]{1,40}$' THEN
    RAISE EXCEPTION 'Clinic ID must be 2-41 lower-case letters, digits, - or _';
  END IF;
  IF length(p_password) < 24 THEN
    RAISE EXCEPTION 'Use a generated password of at least 24 characters';
  END IF;
  r := 'clinic_' || replace(p_facility, '-', '_');
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
    EXECUTE format('ALTER ROLE %I WITH LOGIN NOBYPASSRLS PASSWORD %L', r, p_password);
  ELSE
    EXECUTE format('CREATE ROLE %I WITH LOGIN NOBYPASSRLS PASSWORD %L', r, p_password);
  END IF;
  EXECUTE format('GRANT medilink_clinic TO %I', r);
  INSERT INTO medilink.clinic_logins (role_name, facility_id, clinic_name)
  VALUES (r, p_facility, p_name)
  ON CONFLICT (role_name) DO UPDATE SET clinic_name = EXCLUDED.clinic_name;
  INSERT INTO medilink.facilities (id, code, name, type, active, created_at, sync_status)
  VALUES (p_facility, p_facility, p_name, 'clinic', true, now()::text, 'cloud')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = true;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION medilink.provision_clinic(text, text, text) FROM PUBLIC;

-- Ending a trial: the clinic's login stops working, its rows stay put.
CREATE OR REPLACE FUNCTION medilink.suspend_clinic(p_facility text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = medilink, pg_temp
AS $$
DECLARE r text;
BEGIN
  SELECT role_name INTO r FROM medilink.clinic_logins WHERE facility_id = p_facility;
  IF r IS NULL THEN RAISE EXCEPTION 'No login for clinic %', p_facility; END IF;
  EXECUTE format('ALTER ROLE %I NOLOGIN', r);
  UPDATE medilink.facilities SET active = false WHERE id = p_facility;
END $$;
REVOKE ALL ON FUNCTION medilink.suspend_clinic(text) FROM PUBLIC;

-- ── 5. Check the property instead of trusting it ───────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medilink_clinic' AND rolbypassrls) THEN
    RAISE EXCEPTION 'medilink_clinic can bypass row-level security';
  END IF;
END $$;
