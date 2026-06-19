# MediLink EHR v2.0

**High-Availability Hybrid Cloud Electronic Health Records Platform**  
Final Year Project — Universiti Teknikal Malaysia Melaka (UTeM)  
Bachelor of Technology in Cloud Computing and Application (BITA)  
Student: Yashpreet Singh Gill | B032410981

---

## Architecture

```
┌─────────────────────────────────────────┐
│         CLINIC (On-Premise)             │
│  FastAPI + PostgreSQL on NVMe SSD       │
│  → local-first, 100% offline capable   │
└──────────────┬──────────────────────────┘
               │ Sync (asyncpg)
               ▼
┌─────────────────────────────────────────┐
│         CLOUD (AWS)                     │
│  EC2 (FastAPI) + RDS (PostgreSQL)       │
│  → cross-facility record sharing        │
└─────────────────────────────────────────┘
```

**Well-Architected Framework Pillar: Reliability**  
Target SLA: 99% uptime via local-first architecture

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Tailwind + shadcn/ui + Framer Motion |
| Backend | FastAPI (Python 3.11) |
| Database | PostgreSQL 16 (local SSD + AWS RDS) |
| AI | Groq API — Llama 3.3 70B (triage, summary, drug check) |
| Auth | JWT + bcrypt, role-based (patient/doctor/admin/pharmacist) |
| Payments | DuitNow QR, Touch 'n Go, Bank Transfer, Cash |
| Kiosk ID | MyKad IC camera capture + NRIC parser (YYMMDD-SS-NNNN) |
| Containers | Docker + Docker Compose |

---

## Quick Start (Local Dev)

```bash
# 1. Clone
git clone https://github.com/yashhgill/Medilink.git
cd Medilink

# 2. Backend env
cp backend/.env.example backend/.env
# Fill in: JWT_SECRET, GROQ_API_KEY, DATABASE_URL

# 3. Start everything
docker compose up -d

# 4. Seed demo data
curl -X POST http://localhost:8000/api/seed
```

**Demo accounts (after seed):**
| Role | Email | Password |
|---|---|---|
| Admin | admin@medilink.io | Admin@123 |
| Doctor | dr.tan@medilink.io | Doctor@123 |
| Pharmacist | pharmacy@medilink.io | Pharm@123 |
| Patient | patient1@medilink.io | Patient@123 |

**Kiosk demo ICs:** `880421-14-5567` · `950311-08-2210` · `720915-10-7733`

---

## Key Features

- **Local-first hybrid sync** — clinic runs fully offline, syncs to AWS when online
- **MyKad IC kiosk** — camera capture + real NRIC parsing (DOB, state, gender from IC digits)
- **Manchester Triage System AI** — Groq-powered MTS scoring (Immediate/Very Urgent/Urgent/Standard/Non-Urgent)
- **Pharmacy inventory** — stock tracking, low-stock alerts, expiry warnings, dispense records
- **Local payments** — DuitNow QR generation, TnG deeplink, bank transfer, cash
- **Real-time queue** — WebSocket broadcast to all dashboards
- **Audit logs** — every patient data access logged (who, what, when, from where)
- **Multi-facility record sharing** — doctors at different facilities can view shared records

---

## API Docs

Running locally: `http://localhost:8000/docs`

---

## FYP Evaluation Targets

| Metric | Target |
|---|---|
| System Uptime | ≥ 99% |
| Kiosk check-in time | < 60 seconds |
| AI triage response | < 5 seconds |
| Failover recovery | < 30 seconds |
