# MediLink PHR — Product Requirements Document

## Problem Statement (original)
> "im planning to do my final year project using cloud, ai and iot to improvise phr record management and eliminate downtime issues. i have extra nvme ssd where im planning to do this. nfc card simulate ic and nfc scanner read person ic and then make appointments or see existing appointments and give number, to clinic etc and payments. and then doctor can view and update patient data, medicine etc which stores in my ssd and then store in cloud and pull data both ways."

## User Choices (gathered 2026-02)
- NFC simulation: Both — manual IC entry & webcam QR scan
- Roles: All three — Patient, Doctor, Reception/Admin
- AI features: All three (symptom checker / history summary / drug interaction warnings) via **Gemini 3 Flash** + Emergent LLM Key
- Payments: Mock
- Sync visualization: Local SSD vs Cloud with sync status indicator

## Architecture
- **Frontend**: React 19 + Tailwind + shadcn/ui + framer-motion + @phosphor-icons/react
- **Backend**: FastAPI + Motor (async MongoDB) + JWT auth + bcrypt
- **AI**: emergentintegrations → Gemini 3 Flash (streaming SSE for chat; non-streaming for one-shot calls)
- **Persistence**: MongoDB; records carry `sync_status` field (local → syncing → cloud) simulated via background asyncio tasks

## Personas
- **Patient** — books appointments, pays mock fees, sees queue number, chats with AI triage.
- **Doctor** — sees today's queue, NFC-loads patients, writes records (vitals + prescriptions), gets AI history summary & drug interaction warnings.
- **Reception/Admin** — manages live queue & statuses, NFC check-in, books appointments, triggers manual cloud sync.

## Implemented (2026-02)
- Auth: register/login/me, JWT with role enforcement
- NFC: manual IC modal + webcam QR scan (simulated decode after 3s)
- Appointments: booking, queue numbers (per-day counter), status workflow
- Mock payments
- Medical records: CRUD with vitals + prescriptions, allergies
- SSD-first storage with simulated cloud sync (background asyncio task)
- AI: streaming symptom triage (SSE), patient history summary, drug interaction analysis
- Auto-seeded demo data (3 patients, 2 doctors, 1 admin)
- Three role-aware dashboards with bento-grid layouts, Organic & Earthy palette
- Compact + full sync status indicators with tracing-beam animation
- 100% pass rate on backend (16/16 pytest) and frontend (Playwright)

## Backlog (P1 — next phase)
- Real-time queue updates via WebSocket (currently polled)
- File attachments for records (lab reports, X-rays) → object storage
- Doctor calendar / availability windows for booking
- IoT vitals integration (Bluetooth BP cuff, SpO₂ — Web Bluetooth API)
- Patient AI assistant memory across sessions
- Audit log for record edits

## Backlog (P2 — polish)
- Multi-tenant clinics
- SMS/WhatsApp appointment reminders (Twilio)
- Real Stripe payments (test key available)
- Export PHR as PDF
- Doctor signature on prescriptions
