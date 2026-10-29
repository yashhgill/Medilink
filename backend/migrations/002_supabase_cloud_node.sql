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
