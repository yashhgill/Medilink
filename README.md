# Pulih

**The clinic system that keeps working when the internet doesn't.**
Kiosk check-in with MyKad, triage, the doctor's console, pharmacy and DuitNow
payment for Malaysian GP clinics. Each clinic runs Pulih on its own
computer; a copy of its records follows to the cloud whenever the line is up.

Website: **https://medilink.harnova.my** (moving to pulih.harnova.my).
Desktop builds are shared with trial clinics on request.

Pulih ("to recover" in Malay) was called MediLink during its Final Year
Project at Universiti Teknikal Malaysia Melaka (UTeM), by Yashpreet Singh
Gill. Proprietary: see LICENSE.

## What's inside

| Part | Where |
|---|---|
| Clinic node: FastAPI on SQLite, serves the whole interface | `backend/server.py` |
| Offline triage rules (Manchester Triage, Malay and English) | `backend/triage_offline.py` |
| Interface: React (kiosk, reception, doctor, pharmacy, patient app, waiting-room board) | `frontend/` |
| Desktop app launcher and PyInstaller build for Windows, macOS, Linux | `packaging/` |
| Cloud node migrations (Supabase Postgres, row-level security, per-clinic logins) | `backend/migrations/002`–`004` |
| Issue or suspend a trial clinic's cloud key | `tools/provision_clinic.py` |
| Product website (Cloudflare Pages) | `website/` |
| Tests: route audit, triage, browser journey, reliability (E1–E3), tenant isolation | `backend/`, `tests/` |

## Run it

**As a clinic would:** download the build for your computer from the
[latest release](https://github.com/yashhgill/Medilink/releases/latest), unzip
it and open Pulih. First run opens a short set-up in the browser.

**Demo with sample patients (macOS):** double-click `Client-Demo.command`. It
starts Klinik Melaka with a day of patients already in the queue.

**From source:**

```bash
cd frontend && npm install --legacy-peer-deps && REACT_APP_KIOSK_TOKEN=demo-kiosk-token npx craco build
cp -r build ../backend/static
cd ../backend && pip install -r requirements.txt
python ../packaging/medilink_app.py
```

## Releasing

Push a tag (`git tag v1.1.0 && git push origin v1.1.0`) or run the **Release**
workflow by hand. GitHub builds and smoke-tests the app on Windows, both kinds
of Mac and Linux, and publishes them; the website's download buttons always
point at the latest release.

## Cloud for trial clinics

The cloud is the Supabase project `medilink-cloud`. It was set up with
`backend/migrations/cloud_setup_supabase.sql` (tables, row-level security,
per-clinic logins) and `005_issue_clinic_key.sql`.

1. The clinic copies its Clinic ID from **Clinic settings → Cloud backup**.
2. In the Supabase SQL editor:
   `select medilink.issue_clinic_key('<clinic-id>', '<clinic name>');`
   It returns a key starting `mlk1.`. Send it to the clinic privately.
3. The clinic pastes the key and presses **Connect to cloud**. Pulih checks
   the key, restarts itself and starts uploading.

Each clinic's login can only ever reach its own rows; the database decides
which clinic a login belongs to (see `004_per_clinic_logins.sql` and
`tests/isolation/clinic_logins_test.py`). End a trial with
`select medilink.suspend_clinic('<clinic-id>');`. Issuing a key again for the
same clinic replaces the old one. (`tools/provision_clinic.py` does the same
from a terminal with the owner's connection string.)

## Tests

```bash
cd backend && python audit_standalone.py          # 63 route checks
cd backend && python -m pytest test_triage_offline.py
node tests/e2e/journey.mjs http://127.0.0.1:8001 /tmp/shots   # browser: one full visit
tests/isolation/run_isolation.sh                  # cloud isolation and consent
python tests/isolation/clinic_logins_test.py      # per-clinic logins and in-app connect
```
