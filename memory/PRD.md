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
- Auth: register/login/me, JWT with role enforcement (patient/doctor/admin/**pharmacist**)
- NFC: manual IC modal + webcam QR scan (simulated decode after 3s)
- Appointments: booking, queue numbers (per-day counter), status workflow
- Mock payments
- Medical records: CRUD with vitals + prescriptions, allergies, **file attachments via object storage**
- SSD-first storage with simulated cloud sync (background asyncio task)
- AI: streaming symptom triage (SSE), patient history summary, drug interaction analysis
- **WebSocket real-time queue** (no more polling) at `/api/ws/queue`
- **IoT vitals via Web Bluetooth** (HR, Temp, SpO₂) with Simulated-device fallback
- **Doctor availability calendar** with slot picker; weekly hours editor on Doctor dashboard
- **Public Kiosk terminal** (/kiosk) — check-in → queue ticket chit; pay → receipt + medicine chit; printable via `window.print()`; **walk-in self-registration** when IC is unknown
- **Pharmacy dashboard** (/pharmacy) — sees prescriptions for paid patients, "Dispense" marks treatment complete (status=dispensed)
- **Doctor drag-and-drop day planner** — reschedule by dragging blocks between slots; "+" blocks time; "X" removes blocks (DELETE /api/appointments/{id})
- New statuses: `ready_for_pharmacy`, `dispensed`
- Auto-seeded demo data (3 patients, 2 doctors, 1 admin, 1 pharmacist)
- Four role-aware dashboards + public kiosk
- 21/21 backend pytest pass · 100% frontend pass on iteration 3

## Backlog (P1 — next phase)
- Print integration with a real ESC/POS receipt printer (network printer or WebUSB)
- SMS/WhatsApp queue notification (Twilio) — "Your number is being called"
- Insurance / panel-card flow at the kiosk
- Doctor calendar drag-and-drop block scheduler
- Audit log + edit history for records

## Backlog (P2 — polish)
- Multi-tenant clinics
- SMS/WhatsApp appointment reminders (Twilio)
- Real Stripe payments (test key available)
- Export PHR as PDF
- Doctor signature on prescriptions
