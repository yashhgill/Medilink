"""
MediLink PHR — Cloud + AI + IoT Personal Health Records
FastAPI backend with JWT auth, MongoDB persistence, Gemini AI integration.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Config
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
JWT_ALG = "HS256"
JWT_EXP_HOURS = 24 * 7

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="MediLink PHR")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s")
log = logging.getLogger("medilink")


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def uid() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


def require_role(*roles: str):
    async def dep(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, f"Requires role: {roles}")
        return user
    return dep


# ------------------------------------------------------------
# Models
# ------------------------------------------------------------
Role = Literal["patient", "doctor", "admin"]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Role = "patient"
    ic_number: Optional[str] = None  # patient IC
    phone: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    specialty: Optional[str] = None  # doctor
    license_no: Optional[str] = None  # doctor


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AppointmentIn(BaseModel):
    patient_id: str
    doctor_id: str
    scheduled_at: str  # ISO
    reason: str
    fee: float = 50.0


class AppointmentUpdate(BaseModel):
    status: Optional[Literal["scheduled", "checked_in", "in_progress", "completed", "cancelled"]] = None
    queue_number: Optional[int] = None


class VitalSigns(BaseModel):
    bp: Optional[str] = None
    hr: Optional[int] = None
    temp: Optional[float] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    spo2: Optional[int] = None


class PrescriptionItem(BaseModel):
    medicine: str
    dosage: str
    frequency: str
    duration: str
    notes: Optional[str] = None


class MedicalRecordIn(BaseModel):
    patient_id: str
    appointment_id: Optional[str] = None
    vitals: Optional[VitalSigns] = None
    diagnosis: str
    notes: Optional[str] = None
    prescriptions: List[PrescriptionItem] = []
    allergies: Optional[str] = None


class MockPaymentIn(BaseModel):
    appointment_id: str
    amount: float
    method: Literal["card", "wallet", "fpx"] = "card"


class AISymptomIn(BaseModel):
    message: str
    history: List[Dict[str, str]] = []  # [{role, content}]


class AISummaryIn(BaseModel):
    patient_id: str


class AIDrugCheckIn(BaseModel):
    medicines: List[str]


# ------------------------------------------------------------
# Sanitize doc helper
# ------------------------------------------------------------
def clean(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


# ------------------------------------------------------------
# Auth Routes
# ------------------------------------------------------------
@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    if body.role == "patient" and not body.ic_number:
        # generate fake IC if not provided
        body.ic_number = f"IC-{uuid.uuid4().hex[:8].upper()}"
    user = {
        "id": uid(),
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "ic_number": body.ic_number,
        "phone": body.phone,
        "dob": body.dob,
        "gender": body.gender,
        "specialty": body.specialty,
        "license_no": body.license_no,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_token(user["id"], user["role"])
    return {"token": token, "user": clean(dict(user))}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = create_token(user["id"], user["role"])
    return {"token": token, "user": clean(dict(user))}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# ------------------------------------------------------------
# Patient / NFC routes
# ------------------------------------------------------------
@api.get("/patients")
async def list_patients(user=Depends(get_current_user)):
    if user["role"] == "patient":
        raise HTTPException(403, "Forbidden")
    items = await db.users.find({"role": "patient"}, {"_id": 0, "password_hash": 0}).to_list(500)
    return items


@api.get("/patients/{patient_id}")
async def get_patient(patient_id: str, user=Depends(get_current_user)):
    p = await db.users.find_one({"id": patient_id, "role": "patient"}, {"_id": 0, "password_hash": 0})
    if not p:
        raise HTTPException(404, "Patient not found")
    return p


@api.post("/nfc/scan")
async def nfc_scan(payload: Dict[str, str], user=Depends(get_current_user)):
    """Lookup a patient by IC number (simulates NFC card tap)."""
    ic = payload.get("ic_number", "").strip()
    if not ic:
        raise HTTPException(400, "ic_number required")
    p = await db.users.find_one({"role": "patient", "ic_number": ic}, {"_id": 0, "password_hash": 0})
    if not p:
        raise HTTPException(404, "No patient registered with this IC")
    # also fetch upcoming appointments
    appts = await db.appointments.find({"patient_id": p["id"]}, {"_id": 0}).sort("scheduled_at", -1).to_list(20)
    return {"patient": p, "appointments": appts}


@api.get("/doctors")
async def list_doctors():
    items = await db.users.find({"role": "doctor"}, {"_id": 0, "password_hash": 0}).to_list(200)
    return items


# ------------------------------------------------------------
# Appointments
# ------------------------------------------------------------
async def next_queue_number() -> int:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    counter = await db.counters.find_one_and_update(
        {"key": f"queue-{today}"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    if counter is None:
        # motor older versions return None on insert
        counter = await db.counters.find_one({"key": f"queue-{today}"})
    return counter["value"]


@api.post("/appointments")
async def create_appointment(body: AppointmentIn, user=Depends(get_current_user)):
    q = await next_queue_number()
    doc = {
        "id": uid(),
        "patient_id": body.patient_id,
        "doctor_id": body.doctor_id,
        "scheduled_at": body.scheduled_at,
        "reason": body.reason,
        "fee": body.fee,
        "status": "scheduled",
        "queue_number": q,
        "payment_status": "unpaid",
        "created_at": now_iso(),
        "created_by": user["id"],
    }
    await db.appointments.insert_one(doc)
    return clean(doc)


@api.get("/appointments")
async def list_appointments(user=Depends(get_current_user)):
    query: Dict[str, Any] = {}
    if user["role"] == "patient":
        query["patient_id"] = user["id"]
    elif user["role"] == "doctor":
        query["doctor_id"] = user["id"]
    # admin sees all
    appts = await db.appointments.find(query, {"_id": 0}).sort("scheduled_at", -1).to_list(500)
    # enrich
    for a in appts:
        p = await db.users.find_one({"id": a["patient_id"]}, {"_id": 0, "password_hash": 0})
        d = await db.users.find_one({"id": a["doctor_id"]}, {"_id": 0, "password_hash": 0})
        a["patient"] = p
        a["doctor"] = d
    return appts


@api.patch("/appointments/{appt_id}")
async def update_appointment(appt_id: str, body: AppointmentUpdate, user=Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    res = await db.appointments.find_one_and_update(
        {"id": appt_id}, {"$set": update}, return_document=True
    )
    if not res:
        raise HTTPException(404, "Appointment not found")
    return clean(res)


@api.get("/queue/today")
async def todays_queue(user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    items = await db.appointments.find(
        {"scheduled_at": {"$regex": f"^{today}"}}, {"_id": 0}
    ).sort("queue_number", 1).to_list(200)
    for a in items:
        p = await db.users.find_one({"id": a["patient_id"]}, {"_id": 0, "password_hash": 0})
        d = await db.users.find_one({"id": a["doctor_id"]}, {"_id": 0, "password_hash": 0})
        a["patient"] = p
        a["doctor"] = d
    return items


# ------------------------------------------------------------
# Medical Records
# ------------------------------------------------------------
@api.post("/records")
async def create_record(body: MedicalRecordIn, user=Depends(require_role("doctor"))):
    doc = {
        "id": uid(),
        "patient_id": body.patient_id,
        "doctor_id": user["id"],
        "appointment_id": body.appointment_id,
        "vitals": body.vitals.model_dump() if body.vitals else None,
        "diagnosis": body.diagnosis,
        "notes": body.notes,
        "prescriptions": [p.model_dump() for p in body.prescriptions],
        "allergies": body.allergies,
        "created_at": now_iso(),
        "sync_status": "local",  # local | syncing | cloud
    }
    await db.records.insert_one(doc)
    # simulate sync to cloud after a short delay (background)
    asyncio.create_task(_sync_to_cloud(doc["id"]))
    return clean(doc)


async def _sync_to_cloud(record_id: str):
    await asyncio.sleep(2.5)
    await db.records.update_one({"id": record_id}, {"$set": {"sync_status": "syncing"}})
    await asyncio.sleep(2)
    await db.records.update_one(
        {"id": record_id}, {"$set": {"sync_status": "cloud", "synced_at": now_iso()}}
    )


@api.get("/records/patient/{patient_id}")
async def patient_records(patient_id: str, user=Depends(get_current_user)):
    if user["role"] == "patient" and user["id"] != patient_id:
        raise HTTPException(403, "Forbidden")
    items = await db.records.find({"patient_id": patient_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in items:
        d = await db.users.find_one({"id": r["doctor_id"]}, {"_id": 0, "password_hash": 0})
        r["doctor"] = d
    return items


# ------------------------------------------------------------
# Mock Payment
# ------------------------------------------------------------
@api.post("/payments/mock")
async def mock_payment(body: MockPaymentIn, user=Depends(get_current_user)):
    appt = await db.appointments.find_one({"id": body.appointment_id})
    if not appt:
        raise HTTPException(404, "Appointment not found")
    payment = {
        "id": uid(),
        "appointment_id": body.appointment_id,
        "amount": body.amount,
        "method": body.method,
        "status": "succeeded",
        "paid_by": user["id"],
        "paid_at": now_iso(),
        "txn_ref": f"TXN-{uuid.uuid4().hex[:10].upper()}",
    }
    await db.payments.insert_one(payment)
    await db.appointments.update_one(
        {"id": body.appointment_id}, {"$set": {"payment_status": "paid", "paid_amount": body.amount}}
    )
    return clean(payment)


# ------------------------------------------------------------
# Sync status (SSD vs Cloud simulation)
# ------------------------------------------------------------
@api.get("/sync/status")
async def sync_status(user=Depends(get_current_user)):
    total = await db.records.count_documents({})
    local = await db.records.count_documents({"sync_status": "local"})
    syncing = await db.records.count_documents({"sync_status": "syncing"})
    cloud = await db.records.count_documents({"sync_status": "cloud"})
    last_synced = await db.records.find_one(
        {"sync_status": "cloud"}, {"_id": 0, "synced_at": 1}, sort=[("synced_at", -1)]
    )
    return {
        "total_records": total,
        "local_ssd": local + syncing,
        "syncing": syncing,
        "cloud": cloud,
        "last_synced": last_synced.get("synced_at") if last_synced else None,
        "ssd_label": "Local NVMe SSD",
        "cloud_label": "MediLink Cloud",
        "online": True,
    }


@api.post("/sync/trigger")
async def trigger_sync(user=Depends(require_role("admin", "doctor"))):
    """Force sync any pending records."""
    pending = await db.records.find({"sync_status": {"$in": ["local", "syncing"]}}, {"id": 1}).to_list(1000)
    for r in pending:
        asyncio.create_task(_sync_to_cloud(r["id"]))
    return {"pending": len(pending), "started": True}


# ------------------------------------------------------------
# AI (Gemini) endpoints
# ------------------------------------------------------------
def _make_chat(session_id: str, system: str):
    from emergentintegrations.llm.chat import LlmChat
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model("gemini", "gemini-3-flash-preview")
    return chat


@api.post("/ai/symptom-check")
async def ai_symptom_check(body: AISymptomIn, user=Depends(get_current_user)):
    """Streaming SSE symptom triage chatbot using Gemini."""
    from emergentintegrations.llm.chat import UserMessage, TextDelta, StreamDone

    session_id = f"symptom-{user['id']}"
    sys_msg = (
        "You are MediLink AI, a friendly medical triage assistant. "
        "Ask clarifying questions, identify possible (non-diagnostic) causes, "
        "rate urgency on a scale (Low / Moderate / High / Emergency), and "
        "suggest whether the user should self-care, see a doctor, or go to ER. "
        "Always end with: '⚠️ This is not medical advice. Please consult a doctor.' "
        "Keep responses concise (under 180 words). Use plain text, no markdown headers."
    )
    chat = _make_chat(session_id, sys_msg)

    # rebuild history into one prompt context (the lib auto-manages session memory)
    user_text = body.message

    async def gen():
        try:
            async for ev in chat.stream_message(UserMessage(text=user_text)):
                if isinstance(ev, TextDelta):
                    yield f"data: {ev.content}\n\n"
                elif isinstance(ev, StreamDone):
                    yield "data: [DONE]\n\n"
                    break
        except Exception as e:
            log.exception("ai stream error")
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api.post("/ai/summary")
async def ai_summary(body: AISummaryIn, user=Depends(require_role("doctor", "admin"))):
    """One-shot patient history summary."""
    from emergentintegrations.llm.chat import UserMessage

    p = await db.users.find_one({"id": body.patient_id}, {"_id": 0, "password_hash": 0})
    if not p:
        raise HTTPException(404, "Patient not found")
    records = await db.records.find({"patient_id": body.patient_id}, {"_id": 0}).sort("created_at", -1).to_list(50)

    if not records:
        return {"summary": "No prior medical records available for this patient."}

    history_text = "\n\n".join(
        [
            f"Visit {i+1} ({r.get('created_at','')[:10]}):\n"
            f"  Diagnosis: {r.get('diagnosis','-')}\n"
            f"  Notes: {r.get('notes','-')}\n"
            f"  Vitals: {r.get('vitals')}\n"
            f"  Meds: {', '.join([m['medicine'] for m in r.get('prescriptions',[])]) or '-'}"
            for i, r in enumerate(records)
        ]
    )

    sys_msg = (
        "You are a clinical summarization assistant. Produce a CONCISE doctor-facing "
        "summary of a patient's medical history. Highlight: chronic conditions, "
        "recurring symptoms, key allergies, active medications, and red-flag patterns. "
        "Use short bullets. Max 150 words."
    )
    chat = _make_chat(f"summary-{body.patient_id}-{uid()[:6]}", sys_msg)
    prompt = f"Patient: {p['name']} | DOB: {p.get('dob','-')} | Gender: {p.get('gender','-')}\n\nHISTORY:\n{history_text}"
    try:
        resp = await chat.send_message(UserMessage(text=prompt))
        return {"summary": str(resp)}
    except Exception as e:
        log.exception("summary error")
        raise HTTPException(500, f"AI summary failed: {e}")


@api.post("/ai/drug-check")
async def ai_drug_check(body: AIDrugCheckIn, user=Depends(require_role("doctor", "admin"))):
    """Drug interaction & contraindication warning."""
    from emergentintegrations.llm.chat import UserMessage

    if len(body.medicines) < 1:
        raise HTTPException(400, "Provide at least 1 medicine")

    sys_msg = (
        "You are a pharmacology safety assistant. Given a list of medicines, identify: "
        "1) Known dangerous drug-drug interactions (severity: minor/moderate/major). "
        "2) Common contraindications and side-effects worth mentioning. "
        "Format as short bullet lines. If no significant interactions, say so explicitly. "
        "Max 130 words. End with a one-line disclaimer."
    )
    chat = _make_chat(f"drug-{uid()[:6]}", sys_msg)
    try:
        resp = await chat.send_message(UserMessage(text="Medicines: " + ", ".join(body.medicines)))
        return {"analysis": str(resp), "medicines": body.medicines}
    except Exception as e:
        log.exception("drug check error")
        raise HTTPException(500, f"Drug check failed: {e}")


# ------------------------------------------------------------
# Seed
# ------------------------------------------------------------
@api.post("/seed")
async def seed_demo_data():
    """Idempotent seed of demo users + appointments."""
    seeded = {"created": [], "skipped": []}

    demo_users = [
        {
            "email": "admin@medilink.io",
            "password": "Admin@123",
            "name": "Aria Admin",
            "role": "admin",
        },
        {
            "email": "dr.tan@medilink.io",
            "password": "Doctor@123",
            "name": "Dr. Wei Tan",
            "role": "doctor",
            "specialty": "General Physician",
            "license_no": "MMC-44219",
        },
        {
            "email": "dr.kaur@medilink.io",
            "password": "Doctor@123",
            "name": "Dr. Simran Kaur",
            "role": "doctor",
            "specialty": "Cardiology",
            "license_no": "MMC-55781",
        },
        {
            "email": "patient1@medilink.io",
            "password": "Patient@123",
            "name": "Arjun Rao",
            "role": "patient",
            "ic_number": "IC-880421-14-5567",
            "dob": "1988-04-21",
            "gender": "Male",
            "phone": "+60 12-345 6788",
        },
        {
            "email": "patient2@medilink.io",
            "password": "Patient@123",
            "name": "Mei Lin Chong",
            "role": "patient",
            "ic_number": "IC-950311-08-2210",
            "dob": "1995-03-11",
            "gender": "Female",
            "phone": "+60 16-998 4422",
        },
        {
            "email": "patient3@medilink.io",
            "password": "Patient@123",
            "name": "Hafiz Rahman",
            "role": "patient",
            "ic_number": "IC-720915-10-7733",
            "dob": "1972-09-15",
            "gender": "Male",
            "phone": "+60 19-554 8821",
        },
    ]

    for u in demo_users:
        existing = await db.users.find_one({"email": u["email"]})
        if existing:
            seeded["skipped"].append(u["email"])
            continue
        doc = {
            "id": uid(),
            "email": u["email"],
            "password_hash": hash_password(u["password"]),
            "name": u["name"],
            "role": u["role"],
            "ic_number": u.get("ic_number"),
            "phone": u.get("phone"),
            "dob": u.get("dob"),
            "gender": u.get("gender"),
            "specialty": u.get("specialty"),
            "license_no": u.get("license_no"),
            "created_at": now_iso(),
        }
        await db.users.insert_one(doc)
        seeded["created"].append(u["email"])

    return seeded


@api.get("/")
async def root():
    return {"service": "MediLink PHR", "status": "ok"}


# Include and start
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    # auto-seed once
    n = await db.users.count_documents({})
    if n == 0:
        await seed_demo_data()
        log.info("Seeded demo users on startup")


@app.on_event("shutdown")
async def _shutdown():
    client.close()
