# MediLink

**The clinic system that keeps working when the internet doesn't.**
Kiosk check-in with MyKad, triage, the doctor's console, pharmacy and DuitNow
payment for Malaysian GP clinics. Each clinic runs MediLink on its own
computer; a copy of its records follows to the cloud whenever the line is up.

Website and downloads: **https://medilink.harnova.my**
Latest desktop builds: [Releases](https://github.com/yashhgill/Medilink/releases/latest)

Final Year Project, Universiti Teknikal Malaysia Melaka (UTeM), by
Yashpreet Singh Gill · built and supported by HarNova Technology.

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
it and open MediLink. First run opens a short set-up in the browser.

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

1. Apply `backend/migrations/002`, `003` and `004` to the Supabase project, as
   its owner.
2. The clinic copies its Clinic ID from **Clinic settings → Cloud backup**.
3. `CLOUD_ADMIN_URL=… python tools/provision_clinic.py <clinic-id> "<clinic name>"`
   prints a key starting `mlk1.`; send it privately.
4. The clinic pastes the key and presses **Connect to cloud**. MediLink checks
   the key, restarts itself and starts uploading.

Each clinic's login can only ever reach its own rows; the database decides
which clinic a login belongs to (see `004_per_clinic_logins.sql` and
`tests/isolation/clinic_logins_test.py`). End a trial with
`provision_clinic.py --suspend <clinic-id>`.

## Tests

```bash
cd backend && python audit_standalone.py          # 63 route checks
cd backend && python -m pytest test_triage_offline.py
node tests/e2e/journey.mjs http://127.0.0.1:8001 /tmp/shots   # browser: one full visit
tests/isolation/run_isolation.sh                  # cloud isolation and consent
python tests/isolation/clinic_logins_test.py      # per-clinic logins and in-app connect
```
