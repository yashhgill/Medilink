-- Pulih cloud node set-up for Supabase: 001b + 002 + 003 + 004 in one transaction,
-- then RLS on the old public tables. Safe to run again. Paste into the SQL editor as the project owner.
BEGIN;
-- Pulih cloud node: tables in schema medilink (generated from backend/server.py)

CREATE SCHEMA IF NOT EXISTS medilink;

CREATE TABLE IF NOT EXISTS medilink.users (
	id VARCHAR NOT NULL, 
	email VARCHAR NOT NULL, 
	password_hash VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	role VARCHAR NOT NULL, 
	ic_number VARCHAR, 
	ic_hash VARCHAR, 
	phone VARCHAR, 
	dob VARCHAR, 
	gender VARCHAR, 
	address VARCHAR, 
	specialty VARCHAR, 
	license_no VARCHAR, 
	availability JSON, 
	slot_minutes INTEGER, 
	facility_id VARCHAR, 
	source VARCHAR, 
	activation_code VARCHAR, 
	activation_expires VARCHAR, 
	activated BOOLEAN, 
	created_at VARCHAR, 
	updated_at VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id), 
	UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS medilink.appointments (
	id VARCHAR NOT NULL, 
	patient_id VARCHAR, 
	doctor_id VARCHAR, 
	scheduled_at VARCHAR, 
	reason VARCHAR, 
	fee FLOAT, 
	status VARCHAR, 
	queue_number INTEGER, 
	payment_status VARCHAR, 
	payment_method VARCHAR, 
	payment_ref VARCHAR, 
	paid_amount FLOAT, 
	is_block BOOLEAN, 
	triage_colour VARCHAR, 
	triage_category VARCHAR, 
	triage_target_mins INTEGER, 
	duration_minutes INTEGER, 
	created_at VARCHAR, 
	updated_at VARCHAR, 
	created_by VARCHAR, 
	dispensed_at VARCHAR, 
	dispensed_by VARCHAR, 
	facility_id VARCHAR, 
	source VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.medical_records (
	id VARCHAR NOT NULL, 
	patient_id VARCHAR, 
	doctor_id VARCHAR, 
	appointment_id VARCHAR, 
	facility_id VARCHAR, 
	vitals JSON, 
	diagnosis VARCHAR, 
	notes TEXT, 
	prescriptions JSON, 
	allergies VARCHAR, 
	triage_category VARCHAR, 
	triage_colour VARCHAR, 
	triage_target_mins INTEGER, 
	triage_red_flags JSON, 
	attachment_ids JSON, 
	created_at VARCHAR, 
	updated_at VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.payments (
	id VARCHAR NOT NULL, 
	appointment_id VARCHAR, 
	amount FLOAT, 
	method VARCHAR, 
	status VARCHAR, 
	txn_ref VARCHAR, 
	paid_by VARCHAR, 
	paid_at VARCHAR, 
	receipt_data JSON, 
	facility_id VARCHAR, 
	source VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.pharmacy_inventory (
	id VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	generic_name VARCHAR, 
	category VARCHAR, 
	unit VARCHAR, 
	stock_qty INTEGER, 
	reorder_level INTEGER, 
	unit_price FLOAT, 
	expiry_date VARCHAR, 
	batch_no VARCHAR, 
	supplier VARCHAR, 
	active BOOLEAN, 
	facility_id VARCHAR, 
	created_at VARCHAR, 
	updated_at VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.dispense_records (
	id VARCHAR NOT NULL, 
	appointment_id VARCHAR, 
	patient_id VARCHAR, 
	pharmacist_id VARCHAR, 
	items JSON, 
	total_cost FLOAT, 
	dispensed_at VARCHAR, 
	facility_id VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.audit_logs (
	id VARCHAR NOT NULL, 
	user_id VARCHAR, 
	user_role VARCHAR, 
	action VARCHAR, 
	resource VARCHAR, 
	resource_id VARCHAR, 
	facility_id VARCHAR, 
	ip_address VARCHAR, 
	timestamp VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.attachments (
	id VARCHAR NOT NULL, 
	record_id VARCHAR, 
	patient_id VARCHAR, 
	filename VARCHAR, 
	content_type VARCHAR, 
	size_bytes INTEGER, 
	path VARCHAR, 
	uploaded_by VARCHAR, 
	created_at VARCHAR, 
	facility_id VARCHAR, 
	sync_status VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.stock_movements (
	id VARCHAR NOT NULL, 
	inventory_id VARCHAR, 
	item_name VARCHAR, 
	delta INTEGER, 
	reason VARCHAR, 
	ref VARCHAR, 
	performed_by VARCHAR, 
	created_at VARCHAR, 
	facility_id VARCHAR, 
	sync_status VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.facilities (
	id VARCHAR NOT NULL, 
	code VARCHAR, 
	name VARCHAR, 
	type VARCHAR, 
	address VARCHAR, 
	phone VARCHAR, 
	active BOOLEAN, 
	created_at VARCHAR, 
	sync_status VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.vaccinations (
	id VARCHAR NOT NULL, 
	patient_id VARCHAR, 
	vaccine VARCHAR, 
	dose VARCHAR, 
	batch_no VARCHAR, 
	administered_by VARCHAR, 
	administered_at VARCHAR, 
	facility_id VARCHAR, 
	sync_status VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.record_consents (
	id VARCHAR NOT NULL, 
	patient_id VARCHAR, 
	patient_ic_hash VARCHAR, 
	requesting_facility VARCHAR, 
	requested_by VARCHAR, 
	code VARCHAR, 
	mode VARCHAR, 
	reason TEXT, 
	granted BOOLEAN, 
	expires_at VARCHAR, 
	created_at VARCHAR, 
	granted_at VARCHAR, 
	sync_status VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medilink.lab_orders (
	id VARCHAR NOT NULL, 
	patient_id VARCHAR, 
	doctor_id VARCHAR, 
	record_id VARCHAR, 
	test_name VARCHAR, 
	test_code VARCHAR, 
	status VARCHAR, 
	result_value VARCHAR, 
	result_unit VARCHAR, 
	ref_range VARCHAR, 
	abnormal BOOLEAN, 
	notes TEXT, 
	ordered_at VARCHAR, 
	resulted_at VARCHAR, 
	facility_id VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);
-- ═══════════════════════════════════════════════════════════════════════════
--  Pulih cloud node — Supabase Postgres
--
--  This file supersedes 000_schema.sql and 001_rls_multitenancy.sql, which
--  targeted Neon. It is the migration actually deployed, and it is recorded
--  here so the cloud node can be rebuilt from source rather than from memory.
--
--  Apply to a fresh project with:
--      psql "$CLOUD_DATABASE_URL" -f 002_supabase_cloud_node.sql
--
--  ── Why the move away from Neon ────────────────────────────────────────────
--
--  The isolation model below depends on the application connecting as a role
--  that CANNOT bypass row-level security. On Neon, every available role held
--  rolbypassrls, ALTER ROLE ... NOBYPASSRLS was denied, and CREATE ROLE was
--  not permitted. The policies could be created and would report as enabled
--  and forced while being entirely inert.
--
--  That is the most dangerous class of security failure: one that looks
--  correct. Section 4 below asserts the property rather than trusting it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Schema ───────────────────────────────────────────────────────────────
-- Its own schema, so the cloud node is separated from anything else sharing
-- the project.
CREATE SCHEMA IF NOT EXISTS medilink;

-- ── 2. The session variable every policy keys off ───────────────────────────
-- Returns NULL when unset, and `facility_id = NULL` is never true, so a
-- connection that forgot to identify itself sees NOTHING.
--
-- Failing closed is the design. A clinic seeing zero rows notices within
-- seconds and reports a fault. A clinic seeing another clinic's patients might
-- never notice, and the damage is unbounded.
--
-- search_path is pinned: this function decides who sees which patient, so name
-- resolution inside it must not depend on the caller's environment.
CREATE OR REPLACE FUNCTION medilink.current_facility() RETURNS text
LANGUAGE sql STABLE
SET search_path = medilink, pg_temp
AS $$
  SELECT NULLIF(current_setting('app.facility_id', true), '')
$$;

-- Parses an ISO timestamp stored as text, returning NULL if it is unparseable.
--
-- An earlier version compared expiry as a STRING. Because 'T' sorts above ' ',
-- '2026-08-09T12:00' compared as greater than '2026-08-09 12:00', so an
-- EXPIRED consent could evaluate as still valid. Consent expiry is now a real
-- timestamptz comparison, and an unreadable value yields NULL, which is
-- treated as expired. An expiry that cannot be read must never mean "allow".
CREATE OR REPLACE FUNCTION medilink.app_ts(v text) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
SET search_path = medilink, pg_temp
AS $$
BEGIN
  RETURN v::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- ── 3. Policies ─────────────────────────────────────────────────────────────
-- FORCE is not optional. Without it the table owner bypasses every policy, and
-- since the application owns these tables the isolation would be silently
-- inert. This is exactly the Neon failure described above.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','appointments','medical_records','payments','pharmacy_inventory',
    'dispense_records','attachments','vaccinations','lab_orders',
    'stock_movements','audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE medilink.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE medilink.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS facility_isolation ON medilink.%I', t);
    EXECUTE format($f$
      CREATE POLICY facility_isolation ON medilink.%I
        USING      (facility_id = medilink.current_facility())
        WITH CHECK (facility_id = medilink.current_facility())
    $f$, t);
  END LOOP;
END $$;

-- record_consents is deliberately different. A consent is the mechanism by
-- which one clinic authorises another, so both parties must be able to read
-- it. It is still not world-readable: a clinic sees a consent only if it is
-- party to that consent.
ALTER TABLE medilink.record_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE medilink.record_consents FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_visible_to_parties ON medilink.record_consents;
CREATE POLICY consent_visible_to_parties ON medilink.record_consents
  USING (medilink.current_facility() IS NOT NULL
         AND (requesting_facility = medilink.current_facility()
              OR requested_by     = medilink.current_facility()))
  WITH CHECK (medilink.current_facility() IS NOT NULL
         AND (requesting_facility = medilink.current_facility()
              OR requested_by     = medilink.current_facility()));

-- facilities is a directory of participating clinics: readable by any pinned
-- connection, writable by none of them.
ALTER TABLE medilink.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE medilink.facilities FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facilities_readable ON medilink.facilities;
CREATE POLICY facilities_readable ON medilink.facilities
  FOR SELECT USING (medilink.current_facility() IS NOT NULL);

-- ── 4. The application role ─────────────────────────────────────────────────
-- The clinic nodes must NOT connect as the project owner, which holds
-- rolbypassrls and would ignore every policy above.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medilink_app') THEN
    CREATE ROLE medilink_app LOGIN NOBYPASSRLS;
  ELSE
    ALTER ROLE medilink_app NOBYPASSRLS;
  END IF;
END $$;

REVOKE ALL ON SCHEMA medilink FROM PUBLIC;
GRANT  USAGE ON SCHEMA medilink TO medilink_app;
GRANT  SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA medilink TO medilink_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA medilink
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO medilink_app;
GRANT EXECUTE ON FUNCTION medilink.current_facility() TO medilink_app;

-- No DDL rights, and no reach into any other schema: a compromised clinic node
-- can touch its own rows and nothing else.
REVOKE ALL ON SCHEMA public FROM medilink_app;

-- ── 5. Cross-clinic matching without weakening isolation ────────────────────
-- Strict per-facility policies also block the blind-index lookup the whole
-- cross-clinic feature depends on: a clinic could not discover that a patient
-- has a history elsewhere, so consent could never be requested at all.
--
-- The resolution is to separate two operations that were being conflated:
--
--     MATCHING  "does this person have a record elsewhere?"  -> existence only
--     READING   "show me what that record says"              -> needs consent
--
-- This function answers only the first. SECURITY DEFINER lets it look past the
-- caller's policies, but it returns NO clinical content: only which facility
-- holds something and how much. A clinic learns who to ask. It learns nothing
-- about the patient's health.
--
-- It takes a blind index, never a name or an IC number, so it cannot be used to
-- browse or enumerate patients: the caller must already hold the patient's
-- identifier in order to compute the hash.
CREATE OR REPLACE FUNCTION medilink.find_patient_facilities(p_ic_hash text)
RETURNS TABLE (facility_id text, record_count bigint, last_visit text)
LANGUAGE sql SECURITY DEFINER SET search_path = medilink, pg_temp STABLE
AS $$
  SELECT u.facility_id, count(r.id), max(r.created_at)
  FROM medilink.users u
  LEFT JOIN medilink.medical_records r ON r.patient_id = u.id
  WHERE u.ic_hash = p_ic_hash
    AND p_ic_hash IS NOT NULL
    AND medilink.current_facility() IS NOT NULL
    AND u.facility_id <> medilink.current_facility()
  GROUP BY u.facility_id
$$;
REVOKE ALL ON FUNCTION medilink.find_patient_facilities(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION medilink.find_patient_facilities(text) TO medilink_app;

-- Reading the records themselves stays gated on a granted, unexpired consent.
CREATE OR REPLACE FUNCTION medilink.records_with_consent(p_ic_hash text)
RETURNS SETOF medilink.medical_records
LANGUAGE sql SECURITY DEFINER SET search_path = medilink, pg_temp STABLE
AS $$
  SELECT r.*
  FROM medilink.medical_records r
  JOIN medilink.users u ON u.id = r.patient_id
  WHERE u.ic_hash = p_ic_hash
    AND p_ic_hash IS NOT NULL
    AND medilink.current_facility() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM medilink.record_consents c
      WHERE c.patient_ic_hash     = p_ic_hash
        AND c.requesting_facility = medilink.current_facility()
        AND c.granted IS TRUE
        AND medilink.app_ts(c.expires_at) IS NOT NULL
        AND medilink.app_ts(c.expires_at) > now()
    )
$$;
REVOKE ALL ON FUNCTION medilink.records_with_consent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION medilink.records_with_consent(text) TO medilink_app;

-- ── 6. Assert, do not assume ────────────────────────────────────────────────
-- The Neon attempt failed silently because the configuration merely LOOKED
-- correct. These checks make that failure mode loud.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'medilink' AND c.relkind = 'r'
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'RLS is not forced on: %', bad;
  END IF;

  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'medilink_app') THEN
    RAISE EXCEPTION 'medilink_app can bypass RLS; isolation would be inert';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Verified on the deployed cloud node, connected as medilink_app:
--
--    jasin pinned, users visible ............................. 1 (its own)
--    jasin pinned, melaka records visible .................... 0
--    unpinned connection, anything visible .................. 0  (fails closed)
--    jasin: blind-index match found patient at ............... melaka (1 record)
--    jasin: records readable WITHOUT consent ................. 0
--    jasin: records readable WITH consent .................... 1
--    jasin: records readable after consent EXPIRED .......... 0
--    jasin: records readable with MALFORMED expiry ........... 0
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
--  Pulih cloud node: uniqueness is per clinic, not global.
--
--  The same patient registered at two clinics has two rows in medilink.users,
--  one per facility, linked by the blind index (ic_hash). A kiosk-registered
--  patient's login email is derived from their IC, so the two rows share an
--  email, and a GLOBAL unique constraint made the second clinic's row fail to
--  replicate forever. Under row-level security neither clinic can even see the
--  conflicting row. Uniqueness therefore belongs to (facility_id, email).
--
--  Apply after 002:  psql "$CLOUD_DATABASE_URL" -f 003_cloud_per_clinic_uniqueness.sql
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE medilink.users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS medilink.users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_facility_email_key
  ON medilink.users (facility_id, email);
-- ═══════════════════════════════════════════════════════════════════════════
--  Pulih cloud node: one database login per clinic.
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

-- ── Lock the old PSM demo tables in public away from Supabase's web API ──────
-- They had row-level security off, so anyone with the project's public API key
-- could read them. RLS with no policies blocks the API; the owner still reads them.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

COMMIT;

-- What was set up (shown after the run)
SELECT 'medilink tables' AS item, count(*)::text AS value FROM pg_tables WHERE schemaname='medilink'
UNION ALL SELECT 'medilink tables with RLS forced', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='medilink' AND c.relkind='r' AND c.relforcerowsecurity
UNION ALL SELECT 'public tables still open to the API', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
UNION ALL SELECT 'clinic group can bypass RLS', rolbypassrls::text FROM pg_roles WHERE rolname='medilink_clinic';
