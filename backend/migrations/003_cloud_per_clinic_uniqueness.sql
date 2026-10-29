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
