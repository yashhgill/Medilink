# MediLink

**A local-first clinic operating system.** Patients check in at a kiosk with
their IC, are AI-triaged on the Malaysian zone system, see the doctor, pay by
DuitNow QR, and collect medicine — while every record lives on the clinic's own
server and mirrors to the cloud. The clinic keeps running when the internet
doesn't.

Final Year Project — Universiti Teknikal Malaysia Melaka (UTeM)
Bachelor of Technology in Cloud Computing and Application
**Yashpreet Singh Gill** · B032410981

## What's inside

- **Self-service kiosk** — IC check-in, symptom capture, queue tickets with
  triage zone and an app-download QR, DuitNow payment, medicine chit
- **AI triage** — Manchester Triage System via Llama 3.3 70B, fail-safe to
  arrival order; AI gateway enforces no-diagnosis safety rules
- **Doctor platform** — consultations, prescriptions, AI visit summaries,
  drug-interaction checks, **Web Bluetooth vitals** (BLE heart-rate /
  thermometer stream into the record), X-ray/file uploads
- **Patient app (PWA)** — records, X-rays, bills payable in-app, receipts;
  works on the LAN and worldwide via Cloudflare Tunnel
- **Pharmacy** — dispense queue, inventory, low-stock and expiry alerts
- **Local-first core** — PostgreSQL on the clinic server, write-behind sync to
  a Supabase mirror, automatic catch-up, self-provisioning cloud schema

## Quick start

```bash
git clone https://github.com/yashhgill/medilink.git
cd medilink
./setup-macbook.sh          # generates secrets, boots Docker, prints URLs
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — components, sync engine, failure tiers
- [Security](docs/SECURITY.md) — auth, RBAC, public/clinic boundary, audit, PDPA
- [Triage](docs/TRIAGE.md) — MTS methodology and fail-safe design
- [Testing](docs/TESTING.md) — end-to-end evidence

## Stack

React 19 · FastAPI · PostgreSQL 16 · Docker Compose · Cloudflare Tunnel ·
Supabase (mirror) · Groq Llama 3.3 70B · Web Bluetooth
