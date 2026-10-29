-- ═══════════════════════════════════════════════════════════════════════════
--  Pulih cloud node: issue a trial clinic's cloud key from the SQL editor.
--
--      select medilink.issue_clinic_key('clinic-3f2a1b', 'Klinik Sejahtera');
--
--  Creates (or re-keys) that clinic's own login with a fresh random password
--  and returns the key starting mlk1. that the clinic pastes into
--  Clinic settings → Cloud backup. The password exists only inside the key.
--  Issuing again for the same clinic replaces its previous key.
--  End a trial with:  select medilink.suspend_clinic('clinic-3f2a1b');
--
--  The defaults are this project's session pooler; pass p_host/p_port/p_ref
--  for another project. Run as the project owner (the function is not
--  executable by clinic logins).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION medilink.issue_clinic_key(
  p_facility text, p_name text,
  p_host text DEFAULT 'aws-1-ap-northeast-2.pooler.supabase.com',
  p_port int  DEFAULT 5432,
  p_ref  text DEFAULT 'sjcrmihbfmzjlqctpsbn')
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = medilink, extensions, pg_temp
AS $$
DECLARE
  pw text := replace(translate(encode(extensions.gen_random_bytes(30), 'base64'), '+/=', '-_'), E'\n', '');
  r text;
  login text;
  payload text;
BEGIN
  r := medilink.provision_clinic(p_facility, p_name, pw);
  login := CASE WHEN p_ref IS NULL OR p_ref = '' THEN r ELSE r || '.' || p_ref END;
  payload := json_build_object(
    'u', format('postgresql://%s:%s@%s:%s/postgres', login, pw, p_host, p_port),
    'f', p_facility,
    's', 'medilink')::text;
  RETURN 'mlk1.' || rtrim(replace(translate(encode(convert_to(payload, 'utf8'), 'base64'), '+/', '-_'), E'\n', ''), '=');
END $$;
REVOKE ALL ON FUNCTION medilink.issue_clinic_key(text, text, text, int, text) FROM PUBLIC;
