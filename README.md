# MediLink (FYP edition)

**High-Availability Hybrid-Cloud Clinic Record System**, the Final Year
Project of Yashpreet Singh Gill, Universiti Teknikal Malaysia Melaka
(Bachelor of Cloud Computing and Applications with Honours).
Supervisor: Ts. Mohd Nazrien Bin Zaraini.

Each clinic runs its own node, which holds the authoritative records in
SQLite and keeps working when the internet fails. A write-behind queue
mirrors every change to a shared PostgreSQL cloud node, where row-level
security keeps clinics apart and patient consent governs sharing.

This branch is the assessed scope. The author's commercial product, Pulih,
is separate; see `docs/SCOPE-AND-BACKGROUND-IP.md`.

## What's inside

| Part | Where |
|---|---|
| Clinic node: FastAPI on SQLite, serves the interface | `backend/server.py` |
| Offline triage (Manchester Triage, Malay and English) | `backend/triage_offline.py` |
| Interface: kiosk, reception, doctor, pharmacy, patient portal, board | `frontend/` |
| Cloud node migrations (row-level security) | `backend/migrations/000`–`003` |
| Tests: route audit, triage, journey, isolation, reliability E1–E3 | `backend/`, `tests/` |

## Run it from source

```bash
cd frontend && npm install --legacy-peer-deps
REACT_APP_KIOSK_TOKEN=demo-kiosk-token npx craco build
cp -r build ../backend/static
cd ../backend && pip install -r requirements.txt
cp ../.env.example .env        # set JWT_SECRET, IC_ENCRYPTION_KEY, IC_INDEX_KEY
FRONTEND_DIST=static python -m uvicorn server:app --host 0.0.0.0 --port 8001
```

Open http://localhost:8001 and complete the first-run setup. To mirror to a
cloud node, apply migrations 000 to 003 to PostgreSQL and start the node with
`DEPLOYMENT_MODE=networked` and `CLOUD_DATABASE_URL=...`.

On macOS, `Run-Demo.command` starts a two-clinic demonstration.

## Tests

```bash
cd backend && python audit_standalone.py          # 63/63 routes
python -m pytest -q test_triage_offline.py        # 59/59
bash tests/isolation/run_isolation.sh             # 10/10, needs PostgreSQL on :5433
BOOT=... bash tests/reliability/run_all.sh        # E1–E3
```

Copyright (c) 2026 Yashpreet Singh Gill. See LICENSE.
