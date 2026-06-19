"""
MediLink — High-Availability Hybrid Cloud EHR Platform
FastAPI backend | PostgreSQL | Groq AI | Malaysian IC parser | Local payments
"""
from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, status, Header,
    UploadFile, File, Query, WebSocket, WebSocketDisconnect, Request,
)
from fastapi.responses import StreamingResponse, Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from databases import Database
from sqlalchemy import (
    MetaData, Table, Column, String, Float, Integer, Boolean,
    DateTime, Text, JSON, create_engine, text,
)
from dotenv import load_dotenv
from pathlib import Path
import os, logging, asyncio, uuid, json, re, io, base64
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Literal, Set
from pydantic import BaseModel, Field, EmailStr
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ─── Config ───────────────────────────────────────────────────────────────────
DATABASE_URL  = os.environ["DATABASE_URL"]
JWT_SECRET    = os.environ["JWT_SECRET"]
GROQ_API_KEY  = os.environ.get("GROQ_API_KEY", "")
JWT_ALG       = "HS256"
JWT_EXP_HOURS = 24 * 7
CLINIC_NAME   = os.environ.get("CLINIC_NAME", "MediLink Clinic")
CLINIC_ADDR   = os.environ.get("CLINIC_ADDRESS", "")
CLINIC_PHONE  = os.environ.get("CLINIC_PHONE", "")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s | %(message)s")
log = logging.getLogger("medilink")

# ─── Database setup (asyncpg via databases) ────────────────────────────────────
database = Database(DATABASE_URL)
metadata = MetaData()

# Tables
users_t = Table("users", metadata,
    Column("id", String, primary_key=True),
    Column("email", String, unique=True, nullable=False),
    Column("password_hash", String, nullable=False),
    Column("name", String, nullable=False),
    Column("role", String, nullable=False),           # patient|doctor|admin|pharmacist
    Column("ic_number", String),
    Column("phone", String),
    Column("dob", String),
    Column("gender", String),
    Column("specialty", String),
    Column("license_no", String),
    Column("availability", JSON),
    Column("slot_minutes", Integer, default=30),
    Column("facility_id", String, default="main"),
    Column("source", String, default="web"),
    Column("created_at", String),
)

appointments_t = Table("appointments", metadata,
    Column("id", String, primary_key=True),
    Column("patient_id", String),
    Column("doctor_id", String),
    Column("scheduled_at", String),
    Column("reason", String),
    Column("fee", Float, default=50.0),
    Column("status", String, default="scheduled"),
    Column("queue_number", Integer),
    Column("payment_status", String, default="unpaid"),
    Column("payment_method", String),
    Column("payment_ref", String),
    Column("paid_amount", Float),
    Column("is_block", Boolean, default=False),
    Column("duration_minutes", Integer, default=30),
    Column("created_at", String),
    Column("created_by", String),
    Column("dispensed_at", String),
    Column("dispensed_by", String),
    Column("source", String, default="web"),
    Column("sync_status", String, default="local"),
    Column("synced_at", String),
)

records_t = Table("medical_records", metadata,
    Column("id", String, primary_key=True),
    Column("patient_id", String),
    Column("doctor_id", String),
    Column("appointment_id", String),
    Column("facility_id", String, default="main"),
    Column("vitals", JSON),
    Column("diagnosis", String),
    Column("notes", Text),
    Column("prescriptions", JSON),
    Column("allergies", String),
    Column("triage_category", String),
    Column("triage_score", Integer),
    Column("attachment_ids", JSON),
    Column("created_at", String),
    Column("sync_status", String, default="local"),
    Column("synced_at", String),
)

payments_t = Table("payments", metadata,
    Column("id", String, primary_key=True),
    Column("appointment_id", String),
    Column("amount", Float),
    Column("method", String),          # duitnow|tng|bank|cash
    Column("status", String),
    Column("txn_ref", String),
    Column("paid_by", String),
    Column("paid_at", String),
    Column("receipt_data", JSON),
    Column("source", String, default="web"),
)

inventory_t = Table("pharmacy_inventory", metadata,
    Column("id", String, primary_key=True),
    Column("name", String, nullable=False),
    Column("generic_name", String),
    Column("category", String),
    Column("unit", String),            # tablet|capsule|ml|mg|sachet|tube
    Column("stock_qty", Integer, default=0),
    Column("reorder_level", Integer, default=50),
    Column("unit_price", Float, default=0.0),
    Column("expiry_date", String),
    Column("batch_no", String),
    Column("supplier", String),
    Column("active", Boolean, default=True),
    Column("created_at", String),
    Column("updated_at", String),
)

dispense_t = Table("dispense_records", metadata,
    Column("id", String, primary_key=True),
    Column("appointment_id", String),
    Column("patient_id", String),
    Column("pharmacist_id", String),
    Column("items", JSON),             # [{inventory_id, name, qty, unit_price}]
    Column("total_cost", Float),
    Column("dispensed_at", String),
)

audit_t = Table("audit_logs", metadata,
    Column("id", String, primary_key=True),
    Column("user_id", String),
    Column("user_role", String),
    Column("action", String),          # READ_RECORD|WRITE_RECORD|LOGIN|etc
    Column("resource", String),
    Column("resource_id", String),
    Column("facility_id", String),
    Column("ip_address", String),
    Column("timestamp", String),
)

counters_t = Table("counters", metadata,
    Column("key", String, primary_key=True),
    Column("value", Integer, default=0),
)

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="MediLink EHR", version="2.0.0")
api = APIRouter(prefix="/api")

# ─── Helpers ──────────────────────────────────────────────────────────────────
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

def clean(doc: dict) -> dict:
    if not doc:
        return doc
    d = dict(doc)
    d.pop("password_hash", None)
    return d

# ─── Malaysian IC (NRIC) parser ───────────────────────────────────────────────
NRIC_RE = re.compile(r"^(\d{2})(\d{2})(\d{2})-?(\d{2})-?(\d{4})$")
STATE_MAP = {
    "01": "Johor", "02": "Kedah", "03": "Kelantan", "04": "Melaka",
    "05": "Negeri Sembilan", "06": "Pahang", "07": "Pulau Pinang",
    "08": "Perak", "09": "Perlis", "10": "Selangor", "11": "Terengganu",
    "12": "Sabah", "13": "Sarawak", "14": "Wilayah Persekutuan Kuala Lumpur",
    "15": "Wilayah Persekutuan Labuan", "16": "Wilayah Persekutuan Putrajaya",
}

def parse_ic(ic: str) -> dict:
    """
    Parse Malaysian NRIC format YYMMDD-SS-NNNN.
    Returns {valid, dob, age, state, gender_hint, formatted}
    """
    cleaned = ic.strip().replace(" ", "")
    m = NRIC_RE.match(cleaned)
    if not m:
        return {"valid": False, "formatted": cleaned}
    yy, mm, dd, state_code, seq = m.groups()
    year_int = int(yy)
    current_year = datetime.now().year % 100
    full_year = (1900 + year_int) if year_int > current_year else (2000 + year_int)
    try:
        dob = datetime(full_year, int(mm), int(dd))
        age = (datetime.now() - dob).days // 365
        dob_str = dob.strftime("%Y-%m-%d")
    except ValueError:
        return {"valid": False, "formatted": cleaned, "error": "Invalid date in IC"}
    last_digit = int(seq[-1])
    gender = "Male" if last_digit % 2 == 1 else "Female"
    return {
        "valid": True,
        "formatted": f"{yy}{mm}{dd}-{state_code}-{seq}",
        "dob": dob_str,
        "age": age,
        "state": STATE_MAP.get(state_code, f"State {state_code}"),
        "state_code": state_code,
        "gender_hint": gender,
    }

# ─── Auth helpers ─────────────────────────────────────────────────────────────
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    row = await database.fetch_one(
        users_t.select().where(users_t.c.id == payload["sub"])
    )
    if not row:
        raise HTTPException(401, "User not found")
    return clean(dict(row))

def require_role(*roles: str):
    async def dep(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, f"Requires role: {roles}")
        return user
    return dep

# ─── Audit logging ────────────────────────────────────────────────────────────
async def audit(user_id: str, role: str, action: str, resource: str,
                resource_id: str = "", facility_id: str = "main", ip: str = ""):
    try:
        await database.execute(audit_t.insert().values(
            id=uid(), user_id=user_id, user_role=role,
            action=action, resource=resource, resource_id=resource_id,
            facility_id=facility_id, ip_address=ip, timestamp=now_iso(),
        ))
    except Exception as e:
        log.warning(f"Audit log failed: {e}")

# ─── WebSocket manager ────────────────────────────────────────────────────────
class WSManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()
        self.lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, event: dict):
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.active.discard(d)

ws_manager = WSManager()

def schedule_broadcast(event: dict):
    asyncio.create_task(ws_manager.broadcast(event))

# ─── Pydantic models ──────────────────────────────────────────────────────────
Role = Literal["patient", "doctor", "admin", "pharmacist"]

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Role = "patient"
    ic_number: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    specialty: Optional[str] = None
    license_no: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class AppointmentIn(BaseModel):
    patient_id: str
    doctor_id: str
    scheduled_at: str
    reason: str
    fee: float = 50.0

class AppointmentUpdate(BaseModel):
    status: Optional[Literal[
        "scheduled","checked_in","in_progress","completed",
        "ready_for_pharmacy","dispensed","cancelled"
    ]] = None
    scheduled_at: Optional[str] = None
    doctor_id: Optional[str] = None
    reason: Optional[str] = None

class KioskRegisterIn(BaseModel):
    ic_number: str
    name: str
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None

class KioskCheckinIn(BaseModel):
    ic_number: str
    doctor_id: Optional[str] = None
    reason: Optional[str] = "Walk-in consultation"
    fee: float = 50.0

class KioskPayIn(BaseModel):
    ic_number: str
    appointment_id: str
    method: Literal["duitnow", "tng", "bank", "cash"] = "duitnow"

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

class TriageIn(BaseModel):
    patient_id: str
    chief_complaint: str
    vitals: Optional[VitalSigns] = None
    pain_score: Optional[int] = None    # 0-10
    history: Optional[str] = None

class AvailabilityIn(BaseModel):
    hours: Dict[str, str] = Field(default_factory=dict)
    slot_minutes: int = 30

class BlockTimeIn(BaseModel):
    scheduled_at: str
    reason: Optional[str] = "Blocked"
    duration_minutes: int = 30

class InventoryItemIn(BaseModel):
    name: str
    generic_name: Optional[str] = None
    category: Optional[str] = None
    unit: str = "tablet"
    stock_qty: int = 0
    reorder_level: int = 50
    unit_price: float = 0.0
    expiry_date: Optional[str] = None
    batch_no: Optional[str] = None
    supplier: Optional[str] = None

class InventoryUpdateIn(BaseModel):
    stock_qty: Optional[int] = None
    reorder_level: Optional[int] = None
    unit_price: Optional[float] = None
    expiry_date: Optional[str] = None
    batch_no: Optional[str] = None
    active: Optional[bool] = None

class DispenseIn(BaseModel):
    appointment_id: str
    patient_id: str
    items: List[Dict[str, Any]]    # [{inventory_id, name, qty, unit_price}]

class AISymptomIn(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

class AISummaryIn(BaseModel):
    patient_id: str

class AIDrugCheckIn(BaseModel):
    medicines: List[str]

DEFAULT_AVAILABILITY = {
    "mon": "09:00-17:00", "tue": "09:00-17:00", "wed": "09:00-17:00",
    "thu": "09:00-17:00", "fri": "09:00-17:00", "sat": "10:00-13:00", "sun": "",
}

# ─── Queue counter ────────────────────────────────────────────────────────────
async def next_queue_number() -> int:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    key = f"queue-{today}"
    existing = await database.fetch_one(
        counters_t.select().where(counters_t.c.key == key)
    )
    if existing:
        new_val = existing["value"] + 1
        await database.execute(
            counters_t.update().where(counters_t.c.key == key).values(value=new_val)
        )
        return new_val
    else:
        await database.execute(counters_t.insert().values(key=key, value=1))
        return 1

# ─── Groq AI helper ───────────────────────────────────────────────────────────
async def groq_chat(system: str, messages: list, max_tokens: int = 512) -> str:
    if not GROQ_API_KEY:
        raise HTTPException(503, "AI service not configured (missing GROQ_API_KEY)")
    try:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=GROQ_API_KEY)
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system}, *messages],
            max_tokens=max_tokens,
            temperature=0.3,
        )
        return resp.choices[0].message.content
    except Exception as e:
        log.exception("Groq error")
        raise HTTPException(502, f"AI error: {e}")

async def groq_stream(system: str, messages: list):
    """Async generator yielding SSE chunks from Groq."""
    if not GROQ_API_KEY:
        yield "data: [ERROR] AI not configured\n\n"
        return
    try:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=GROQ_API_KEY)
        stream = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system}, *messages],
            max_tokens=512,
            temperature=0.4,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield f"data: {delta}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        log.exception("Groq stream error")
        yield f"data: [ERROR] {str(e)}\n\n"

# ─── DuitNow QR generator (SVG placeholder — real impl uses PayNet SDK) ───────
def generate_duitnow_qr(amount: float, ref: str, clinic_name: str) -> str:
    """
    Returns a base64-encoded PNG QR code image.
    In production: call PayNet DuitNow Dynamic QR API.
    For FYP demo: generates a QR with the payment payload string.
    """
    try:
        import qrcode
        payload = f"DUITNOW|{clinic_name}|{ref}|MYR{amount:.2f}"
        qr = qrcode.QRCode(version=2, box_size=6, border=2)
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ""

# ─── Patient helpers ──────────────────────────────────────────────────────────
async def patient_by_ic(ic: str):
    return await database.fetch_one(
        users_t.select().where(
            (users_t.c.ic_number == ic.strip()) & (users_t.c.role == "patient")
        )
    )

async def todays_appts_for_patient(patient_id: str):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = await database.fetch_all(
        appointments_t.select()
        .where(
            (appointments_t.c.patient_id == patient_id) &
            (appointments_t.c.scheduled_at.like(f"{today}%"))
        )
        .order_by(appointments_t.c.queue_number)
    )
    result = []
    for r in rows:
        a = dict(r)
        doc = await database.fetch_one(users_t.select().where(users_t.c.id == a["doctor_id"]))
        a["doctor"] = clean(dict(doc)) if doc else None
        result.append(a)
    return result

# ─── IC parse endpoint (public — kiosk uses this) ────────────────────────────
@api.get("/ic/parse/{ic_number}")
async def ic_parse(ic_number: str):
    return parse_ic(ic_number)

# ─── Auth routes ──────────────────────────────────────────────────────────────
@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await database.fetch_one(
        users_t.select().where(users_t.c.email == body.email.lower())
    )
    if existing:
        raise HTTPException(400, "Email already registered")
    ic = body.ic_number
    dob = body.dob
    gender = body.gender
    if body.role == "patient" and ic:
        parsed = parse_ic(ic)
        if parsed["valid"]:
            ic = parsed["formatted"]
            dob = dob or parsed.get("dob")
            gender = gender or parsed.get("gender_hint")
    user_id = uid()
    await database.execute(users_t.insert().values(
        id=user_id, email=body.email.lower(),
        password_hash=hash_password(body.password),
        name=body.name, role=body.role,
        ic_number=ic, phone=body.phone,
        dob=dob, gender=gender,
        specialty=body.specialty, license_no=body.license_no,
        availability=DEFAULT_AVAILABILITY if body.role == "doctor" else None,
        slot_minutes=30, facility_id="main",
        source="web", created_at=now_iso(),
    ))
    user = clean(dict(await database.fetch_one(
        users_t.select().where(users_t.c.id == user_id)
    )))
    return {"token": create_token(user_id, body.role), "user": user}

@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    row = await database.fetch_one(
        users_t.select().where(users_t.c.email == body.email.lower())
    )
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    await audit(row["id"], row["role"], "LOGIN", "auth", ip=request.client.host if request.client else "")
    return {"token": create_token(row["id"], row["role"]), "user": clean(dict(row))}

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

# ─── Patients ─────────────────────────────────────────────────────────────────
@api.get("/patients")
async def list_patients(user=Depends(get_current_user)):
    if user["role"] == "patient":
        raise HTTPException(403, "Forbidden")
    rows = await database.fetch_all(
        users_t.select().where(users_t.c.role == "patient").order_by(users_t.c.name)
    )
    return [clean(dict(r)) for r in rows]

@api.get("/patients/{patient_id}")
async def get_patient(patient_id: str, user=Depends(get_current_user)):
    row = await database.fetch_one(
        users_t.select().where(
            (users_t.c.id == patient_id) & (users_t.c.role == "patient")
        )
    )
    if not row:
        raise HTTPException(404, "Patient not found")
    await audit(user["id"], user["role"], "READ_PATIENT", "users", patient_id)
    return clean(dict(row))

@api.get("/doctors")
async def list_doctors(user=Depends(get_current_user)):
    rows = await database.fetch_all(
        users_t.select().where(users_t.c.role == "doctor")
    )
    return [clean(dict(r)) for r in rows]

# ─── IC Kiosk lookup (public) ────────────────────────────────────────────────
@api.get("/kiosk/lookup/{ic_number}")
async def kiosk_lookup(ic_number: str):
    p = await patient_by_ic(ic_number)
    if not p:
        raise HTTPException(404, "No patient registered with this IC")
    appts = await todays_appts_for_patient(p["id"])
    parsed = parse_ic(ic_number)
    return {"patient": clean(dict(p)), "today_appointments": appts, "ic_info": parsed}

@api.post("/kiosk/register")
async def kiosk_register(body: KioskRegisterIn):
    ic = body.ic_number.strip()
    parsed = parse_ic(ic)
    if not parsed["valid"]:
        raise HTTPException(400, f"Invalid IC format: {ic}. Expected YYMMDD-SS-NNNN")
    existing = await patient_by_ic(ic)
    if existing:
        raise HTTPException(400, "Patient with this IC already registered")
    email = (body.email or f"{ic.replace('-','').lower()}@kiosk.medilink.io").lower()
    if await database.fetch_one(users_t.select().where(users_t.c.email == email)):
        raise HTTPException(400, "Email already in use")
    pwd = body.password or f"kiosk-{uuid.uuid4().hex[:10]}"
    user_id = uid()
    await database.execute(users_t.insert().values(
        id=user_id, email=email,
        password_hash=hash_password(pwd),
        name=body.name, role="patient",
        ic_number=parsed["formatted"],
        phone=body.phone,
        dob=parsed.get("dob"), gender=parsed.get("gender_hint"),
        facility_id="main", source="kiosk", created_at=now_iso(),
    ))
    user = clean(dict(await database.fetch_one(users_t.select().where(users_t.c.id == user_id))))
    return {"patient": user, "ic_info": parsed}

@api.post("/kiosk/checkin")
async def kiosk_checkin(body: KioskCheckinIn):
    ic = body.ic_number.strip()
    p = await patient_by_ic(ic)
    if not p:
        raise HTTPException(404, "No patient registered with this IC")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await database.fetch_one(
        appointments_t.select().where(
            (appointments_t.c.patient_id == p["id"]) &
            (appointments_t.c.scheduled_at.like(f"{today}%")) &
            appointments_t.c.status.in_(["scheduled", "checked_in"])
        ).order_by(appointments_t.c.scheduled_at)
    )
    if existing:
        appt = dict(existing)
        if appt["status"] == "scheduled":
            await database.execute(
                appointments_t.update()
                .where(appointments_t.c.id == appt["id"])
                .values(status="checked_in")
            )
            appt["status"] = "checked_in"
            schedule_broadcast({"type": "appointment.updated", "appointment_id": appt["id"], "changes": {"status": "checked_in"}})
    else:
        doctor_row = None
        if body.doctor_id:
            doctor_row = await database.fetch_one(
                users_t.select().where((users_t.c.id == body.doctor_id) & (users_t.c.role == "doctor"))
            )
        if not doctor_row:
            doctor_row = await database.fetch_one(users_t.select().where(users_t.c.role == "doctor"))
        if not doctor_row:
            raise HTTPException(503, "No doctors configured")
        q = await next_queue_number()
        appt_id = uid()
        appt = {
            "id": appt_id, "patient_id": p["id"], "doctor_id": doctor_row["id"],
            "scheduled_at": now_iso(), "reason": body.reason or "Walk-in consultation",
            "fee": body.fee, "status": "checked_in", "queue_number": q,
            "payment_status": "unpaid", "created_at": now_iso(),
            "created_by": "kiosk", "source": "kiosk", "sync_status": "local",
        }
        await database.execute(appointments_t.insert().values(**appt))
        schedule_broadcast({"type": "appointment.created", "appointment_id": appt_id})

    doc_row = await database.fetch_one(users_t.select().where(users_t.c.id == appt["doctor_id"]))
    d = clean(dict(doc_row)) if doc_row else {}
    chit = {
        "type": "QUEUE", "clinic_name": CLINIC_NAME,
        "patient_name": p["name"], "patient_ic": p["ic_number"],
        "queue_number": appt["queue_number"],
        "doctor_name": d.get("name", "-"), "doctor_specialty": d.get("specialty", "General"),
        "reason": appt["reason"], "issued_at": now_iso(), "appointment_id": appt["id"],
    }
    return {"appointment": appt, "patient": clean(dict(p)), "doctor": d, "chit": chit}

@api.post("/kiosk/pay")
async def kiosk_pay(body: KioskPayIn):
    p = await patient_by_ic(body.ic_number.strip())
    if not p:
        raise HTTPException(404, "Patient not found")
    appt_row = await database.fetch_one(
        appointments_t.select().where(appointments_t.c.id == body.appointment_id)
    )
    if not appt_row or appt_row["patient_id"] != p["id"]:
        raise HTTPException(404, "Appointment not found for this patient")
    appt = dict(appt_row)
    if appt.get("payment_status") == "paid":
        raise HTTPException(400, "Already paid")

    amount = float(appt.get("fee") or 50.0)
    txn_ref = f"MLK-{uuid.uuid4().hex[:10].upper()}"

    # Generate payment artefacts based on method
    qr_base64 = ""
    payment_info = {}
    if body.method == "duitnow":
        qr_base64 = generate_duitnow_qr(amount, txn_ref, CLINIC_NAME)
        payment_info = {"type": "DuitNow QR", "ref": txn_ref, "qr": qr_base64}
    elif body.method == "tng":
        payment_info = {
            "type": "Touch 'n Go eWallet",
            "deeplink": f"tngd://pay?amount={amount:.2f}&ref={txn_ref}",
            "ref": txn_ref,
        }
    elif body.method == "bank":
        payment_info = {
            "type": "Bank Transfer",
            "account_name": CLINIC_NAME,
            "account_no": os.environ.get("BANK_ACCOUNT_NO", "1234567890"),
            "bank": os.environ.get("BANK_NAME", "Maybank"),
            "ref": txn_ref,
            "amount": amount,
        }
    else:
        payment_info = {"type": "Cash", "ref": txn_ref, "amount": amount}

    pay_id = uid()
    await database.execute(payments_t.insert().values(
        id=pay_id, appointment_id=appt["id"],
        amount=amount, method=body.method,
        status="pending" if body.method in ("duitnow", "tng", "bank") else "succeeded",
        txn_ref=txn_ref, paid_by="kiosk", paid_at=now_iso(),
        receipt_data=payment_info, source="kiosk",
    ))
    await database.execute(
        appointments_t.update()
        .where(appointments_t.c.id == appt["id"])
        .values(
            payment_status="paid" if body.method == "cash" else "pending",
            payment_method=body.method,
            payment_ref=txn_ref,
            paid_amount=amount,
            status="ready_for_pharmacy" if body.method == "cash" else appt["status"],
        )
    )
    schedule_broadcast({"type": "appointment.updated", "appointment_id": appt["id"]})

    # Fetch prescriptions for medicine chit
    rec = await database.fetch_one(
        records_t.select()
        .where((records_t.c.patient_id == p["id"]) & (records_t.c.appointment_id == appt["id"]))
        .order_by(records_t.c.created_at.desc())
    )
    prescriptions = (dict(rec).get("prescriptions") or []) if rec else []
    doc_row = await database.fetch_one(users_t.select().where(users_t.c.id == appt["doctor_id"]))

    receipt = {
        "type": "RECEIPT", "clinic_name": CLINIC_NAME,
        "clinic_address": CLINIC_ADDR, "clinic_phone": CLINIC_PHONE,
        "patient_name": p["name"], "patient_ic": p["ic_number"],
        "amount": amount, "method": body.method,
        "txn_ref": txn_ref, "paid_at": now_iso(),
        "appointment_id": appt["id"],
    }
    medicine_chit = {
        "type": "MEDICINE", "clinic_name": f"{CLINIC_NAME} — Pharmacy",
        "patient_name": p["name"], "patient_ic": p["ic_number"],
        "queue_number": appt["queue_number"],
        "doctor_name": doc_row["name"] if doc_row else "-",
        "prescriptions": prescriptions, "appointment_id": appt["id"],
        "issued_at": now_iso(),
    }
    return {
        "appointment": appt, "payment": payment_info,
        "receipt": receipt, "medicine_chit": medicine_chit,
    }

@api.post("/kiosk/payment-confirm/{txn_ref}")
async def confirm_payment(txn_ref: str):
    """Called by payment gateway webhook / staff to mark payment complete."""
    pay_row = await database.fetch_one(
        payments_t.select().where(payments_t.c.txn_ref == txn_ref)
    )
    if not pay_row:
        raise HTTPException(404, "Transaction not found")
    await database.execute(
        payments_t.update().where(payments_t.c.txn_ref == txn_ref).values(status="succeeded")
    )
    await database.execute(
        appointments_t.update()
        .where(appointments_t.c.id == pay_row["appointment_id"])
        .values(payment_status="paid", status="ready_for_pharmacy")
    )
    schedule_broadcast({"type": "appointment.updated", "appointment_id": pay_row["appointment_id"]})
    return {"ok": True, "txn_ref": txn_ref}

# ─── Appointments ─────────────────────────────────────────────────────────────
@api.post("/appointments")
async def create_appointment(body: AppointmentIn, user=Depends(get_current_user)):
    q = await next_queue_number()
    appt_id = uid()
    await database.execute(appointments_t.insert().values(
        id=appt_id, patient_id=body.patient_id, doctor_id=body.doctor_id,
        scheduled_at=body.scheduled_at, reason=body.reason, fee=body.fee,
        status="scheduled", queue_number=q, payment_status="unpaid",
        created_at=now_iso(), created_by=user["id"], source="web", sync_status="local",
    ))
    schedule_broadcast({"type": "appointment.created", "appointment_id": appt_id})
    row = await database.fetch_one(appointments_t.select().where(appointments_t.c.id == appt_id))
    return dict(row)

@api.get("/appointments")
async def list_appointments(user=Depends(get_current_user)):
    q = appointments_t.select()
    if user["role"] == "patient":
        q = q.where(appointments_t.c.patient_id == user["id"])
    elif user["role"] == "doctor":
        q = q.where(appointments_t.c.doctor_id == user["id"])
    rows = await database.fetch_all(q.order_by(appointments_t.c.scheduled_at.desc()))
    result = []
    for r in rows:
        a = dict(r)
        p = await database.fetch_one(users_t.select().where(users_t.c.id == a["patient_id"]))
        d = await database.fetch_one(users_t.select().where(users_t.c.id == a["doctor_id"]))
        a["patient"] = clean(dict(p)) if p else None
        a["doctor"] = clean(dict(d)) if d else None
        result.append(a)
    return result

@api.patch("/appointments/{appt_id}")
async def update_appointment(appt_id: str, body: AppointmentUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    await database.execute(
        appointments_t.update().where(appointments_t.c.id == appt_id).values(**updates)
    )
    schedule_broadcast({"type": "appointment.updated", "appointment_id": appt_id, "changes": updates})
    row = await database.fetch_one(appointments_t.select().where(appointments_t.c.id == appt_id))
    if not row:
        raise HTTPException(404, "Appointment not found")
    return dict(row)

@api.delete("/appointments/{appt_id}")
async def delete_appointment(appt_id: str, user=Depends(get_current_user)):
    row = await database.fetch_one(appointments_t.select().where(appointments_t.c.id == appt_id))
    if not row:
        raise HTTPException(404, "Appointment not found")
    appt = dict(row)
    if user["role"] == "doctor":
        if appt.get("doctor_id") != user["id"] or not appt.get("is_block"):
            raise HTTPException(403, "Doctors can only delete their own time blocks")
    elif user["role"] not in ("admin",):
        raise HTTPException(403, "Forbidden")
    await database.execute(appointments_t.delete().where(appointments_t.c.id == appt_id))
    schedule_broadcast({"type": "appointment.deleted", "appointment_id": appt_id})
    return {"ok": True}

@api.post("/appointments/block")
async def block_time(body: BlockTimeIn, user=Depends(require_role("doctor"))):
    q = await next_queue_number()
    doc_id = uid()
    await database.execute(appointments_t.insert().values(
        id=doc_id, patient_id=None, doctor_id=user["id"],
        scheduled_at=body.scheduled_at, reason=body.reason or "Blocked",
        fee=0, status="cancelled", queue_number=q,
        payment_status="n/a", is_block=True,
        duration_minutes=body.duration_minutes,
        created_at=now_iso(), created_by=user["id"], source="web", sync_status="local",
    ))
    schedule_broadcast({"type": "appointment.created", "appointment_id": doc_id})
    row = await database.fetch_one(appointments_t.select().where(appointments_t.c.id == doc_id))
    return dict(row)

@api.get("/queue/today")
async def todays_queue(user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = await database.fetch_all(
        appointments_t.select()
        .where(appointments_t.c.scheduled_at.like(f"{today}%"))
        .order_by(appointments_t.c.queue_number)
    )
    result = []
    for r in rows:
        a = dict(r)
        p = await database.fetch_one(users_t.select().where(users_t.c.id == a["patient_id"]))
        d = await database.fetch_one(users_t.select().where(users_t.c.id == a["doctor_id"]))
        a["patient"] = clean(dict(p)) if p else None
        a["doctor"] = clean(dict(d)) if d else None
        result.append(a)
    return result

# ─── Medical records ──────────────────────────────────────────────────────────
@api.post("/records")
async def create_record(body: MedicalRecordIn, user=Depends(require_role("doctor")), request: Request = None):
    rec_id = uid()
    await database.execute(records_t.insert().values(
        id=rec_id, patient_id=body.patient_id,
        doctor_id=user["id"], appointment_id=body.appointment_id,
        facility_id="main",
        vitals=body.vitals.model_dump() if body.vitals else None,
        diagnosis=body.diagnosis, notes=body.notes,
        prescriptions=[p.model_dump() for p in body.prescriptions],
        allergies=body.allergies, attachment_ids=[],
        created_at=now_iso(), sync_status="local",
    ))
    await audit(user["id"], user["role"], "WRITE_RECORD", "medical_records", rec_id,
                ip=request.client.host if request and request.client else "")
    row = await database.fetch_one(records_t.select().where(records_t.c.id == rec_id))
    return dict(row)

@api.get("/records/patient/{patient_id}")
async def patient_records(patient_id: str, user=Depends(get_current_user), request: Request = None):
    if user["role"] == "patient" and user["id"] != patient_id:
        raise HTTPException(403, "Forbidden")
    rows = await database.fetch_all(
        records_t.select()
        .where(records_t.c.patient_id == patient_id)
        .order_by(records_t.c.created_at.desc())
    )
    await audit(user["id"], user["role"], "READ_RECORD", "medical_records", patient_id,
                ip=request.client.host if request and request.client else "")
    result = []
    for r in rows:
        rec = dict(r)
        doc = await database.fetch_one(users_t.select().where(users_t.c.id == rec["doctor_id"]))
        rec["doctor"] = clean(dict(doc)) if doc else None
        result.append(rec)
    return result

# ─── AI Triage (Manchester Triage System) ────────────────────────────────────
MTS_SYSTEM = """You are MediLink's clinical triage AI using the Manchester Triage System (MTS).
Given a patient's chief complaint, vital signs, and pain score, output ONLY valid JSON:
{
  "category": "Immediate|Very Urgent|Urgent|Standard|Non-Urgent",
  "colour": "Red|Orange|Yellow|Green|Blue",
  "target_wait_minutes": <integer>,
  "reasoning": "<1-2 sentence clinical rationale>",
  "red_flags": ["<flag1>", ...],
  "recommended_action": "<what staff should do now>"
}

MTS Reference:
- Immediate (Red): Life-threatening. Target: 0 min
- Very Urgent (Orange): Very serious. Target: 10 min
- Urgent (Yellow): Urgent. Target: 60 min
- Standard (Green): Standard. Target: 120 min
- Non-Urgent (Blue): Non-urgent. Target: 240 min

Always base on clinical indicators. Err on the side of caution."""

@api.post("/ai/triage")
async def ai_triage(body: TriageIn, user=Depends(require_role("doctor", "admin"))):
    vitals_str = ""
    if body.vitals:
        v = body.vitals
        parts = []
        if v.bp: parts.append(f"BP: {v.bp}")
        if v.hr: parts.append(f"HR: {v.hr} bpm")
        if v.temp: parts.append(f"Temp: {v.temp}°C")
        if v.spo2: parts.append(f"SpO2: {v.spo2}%")
        vitals_str = " | ".join(parts)
    prompt = (
        f"Chief complaint: {body.chief_complaint}\n"
        f"Vitals: {vitals_str or 'Not recorded'}\n"
        f"Pain score: {body.pain_score}/10\n"
        f"History: {body.history or 'None provided'}"
    )
    raw = await groq_chat(MTS_SYSTEM, [{"role": "user", "content": prompt}], max_tokens=400)
    try:
        clean_raw = raw.strip().lstrip("```json").rstrip("```").strip()
        result = json.loads(clean_raw)
    except Exception:
        result = {"raw": raw, "parse_error": True}
    return result

@api.post("/ai/symptom-check")
async def ai_symptom_check(body: AISymptomIn, user=Depends(get_current_user)):
    system = (
        "You are MediLink AI, a friendly medical triage assistant for a Malaysian clinic. "
        "Ask clarifying questions, identify possible causes (non-diagnostic), "
        "rate urgency (Low/Moderate/High/Emergency), and advise whether to self-care, "
        "see a doctor, or go to ER. End every response with: "
        "'⚠️ This is not medical advice. Please consult a doctor.' "
        "Keep responses under 150 words. Plain text only."
    )
    messages = body.history + [{"role": "user", "content": body.message}]
    return StreamingResponse(
        groq_stream(system, messages),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@api.post("/ai/summary")
async def ai_summary(body: AISummaryIn, user=Depends(require_role("doctor", "admin"))):
    p = await database.fetch_one(users_t.select().where(users_t.c.id == body.patient_id))
    if not p:
        raise HTTPException(404, "Patient not found")
    rows = await database.fetch_all(
        records_t.select()
        .where(records_t.c.patient_id == body.patient_id)
        .order_by(records_t.c.created_at.desc()).limit(20)
    )
    if not rows:
        return {"summary": "No prior medical records found."}
    history_text = "\n\n".join([
        f"Visit {i+1} ({dict(r).get('created_at','')[:10]}):\n"
        f"  Diagnosis: {dict(r).get('diagnosis','-')}\n"
        f"  Notes: {dict(r).get('notes','-')}\n"
        f"  Meds: {', '.join([m['medicine'] for m in (dict(r).get('prescriptions') or [])]) or '-'}"
        for i, r in enumerate(rows)
    ])
    system = (
        "You are a clinical summarization assistant. Produce a concise doctor-facing summary. "
        "Highlight chronic conditions, recurring symptoms, key allergies, active medications, "
        "and red-flag patterns. Use short bullets. Max 150 words."
    )
    patient = dict(p)
    prompt = f"Patient: {patient['name']} | DOB: {patient.get('dob','-')} | Gender: {patient.get('gender','-')}\n\nHISTORY:\n{history_text}"
    summary = await groq_chat(system, [{"role": "user", "content": prompt}])
    return {"summary": summary}

@api.post("/ai/drug-check")
async def ai_drug_check(body: AIDrugCheckIn, user=Depends(require_role("doctor", "admin"))):
    if not body.medicines:
        raise HTTPException(400, "Provide at least 1 medicine")
    system = (
        "You are a pharmacology safety assistant. Given medicines, identify: "
        "1) Drug-drug interactions (severity: minor/moderate/major). "
        "2) Common contraindications. Short bullets. Max 130 words. End with disclaimer."
    )
    result = await groq_chat(system, [{"role": "user", "content": "Medicines: " + ", ".join(body.medicines)}])
    return {"analysis": result, "medicines": body.medicines}

# ─── Availability & Slots ──────────────────────────────────────────────────────
@api.get("/availability/{doctor_id}")
async def get_availability(doctor_id: str):
    d = await database.fetch_one(
        users_t.select().where((users_t.c.id == doctor_id) & (users_t.c.role == "doctor"))
    )
    if not d:
        raise HTTPException(404, "Doctor not found")
    return {
        "doctor_id": doctor_id,
        "hours": dict(d)["availability"] or DEFAULT_AVAILABILITY,
        "slot_minutes": dict(d).get("slot_minutes", 30),
    }

@api.patch("/availability/me")
async def update_availability(body: AvailabilityIn, user=Depends(require_role("doctor"))):
    await database.execute(
        users_t.update().where(users_t.c.id == user["id"])
        .values(availability=body.hours, slot_minutes=body.slot_minutes)
    )
    return {"hours": body.hours, "slot_minutes": body.slot_minutes}

@api.get("/availability/{doctor_id}/slots")
async def get_slots(doctor_id: str, date: str = Query(...)):
    d = await database.fetch_one(
        users_t.select().where((users_t.c.id == doctor_id) & (users_t.c.role == "doctor"))
    )
    if not d:
        raise HTTPException(404, "Doctor not found")
    doc = dict(d)
    try:
        the_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    dow = ["mon","tue","wed","thu","fri","sat","sun"][the_date.weekday()]
    hours_map = doc.get("availability") or DEFAULT_AVAILABILITY
    window = hours_map.get(dow, "")
    if not window or "-" not in window:
        return {"date": date, "doctor_id": doctor_id, "slots": [], "off": True}
    try:
        a, b = window.split("-")
        sh, sm = map(int, a.split(":"))
        eh, em = map(int, b.split(":"))
        start_min, end_min = sh*60+sm, eh*60+em
    except Exception:
        return {"date": date, "doctor_id": doctor_id, "slots": [], "off": True}
    slot_min = int(doc.get("slot_minutes") or 30)
    booked_rows = await database.fetch_all(
        appointments_t.select().where(
            (appointments_t.c.doctor_id == doctor_id) &
            (appointments_t.c.scheduled_at.like(f"{date}%")) &
            (appointments_t.c.status != "cancelled")
        )
    )
    booked_set = set()
    for r in booked_rows:
        try:
            t = datetime.fromisoformat(dict(r)["scheduled_at"].replace("Z", "+00:00"))
            booked_set.add(t.hour*60+t.minute)
        except Exception:
            pass
    slots = []
    cur = start_min
    while cur + slot_min <= end_min:
        hh, mm = divmod(cur, 60)
        slot_iso = the_date.replace(hour=hh, minute=mm).isoformat()
        slots.append({"time": f"{hh:02d}:{mm:02d}", "iso": slot_iso, "booked": cur in booked_set})
        cur += slot_min
    return {"date": date, "doctor_id": doctor_id, "slots": slots, "off": False}

# ─── Pharmacy inventory ───────────────────────────────────────────────────────
@api.get("/inventory")
async def list_inventory(user=Depends(require_role("pharmacist", "admin", "doctor"))):
    rows = await database.fetch_all(
        inventory_t.select().where(inventory_t.c.active == True).order_by(inventory_t.c.name)
    )
    return [dict(r) for r in rows]

@api.post("/inventory")
async def add_inventory(body: InventoryItemIn, user=Depends(require_role("pharmacist", "admin"))):
    item_id = uid()
    await database.execute(inventory_t.insert().values(
        id=item_id, name=body.name, generic_name=body.generic_name,
        category=body.category, unit=body.unit,
        stock_qty=body.stock_qty, reorder_level=body.reorder_level,
        unit_price=body.unit_price, expiry_date=body.expiry_date,
        batch_no=body.batch_no, supplier=body.supplier,
        active=True, created_at=now_iso(), updated_at=now_iso(),
    ))
    row = await database.fetch_one(inventory_t.select().where(inventory_t.c.id == item_id))
    return dict(row)

@api.patch("/inventory/{item_id}")
async def update_inventory(item_id: str, body: InventoryUpdateIn, user=Depends(require_role("pharmacist", "admin"))):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    await database.execute(
        inventory_t.update().where(inventory_t.c.id == item_id).values(**updates)
    )
    row = await database.fetch_one(inventory_t.select().where(inventory_t.c.id == item_id))
    if not row:
        raise HTTPException(404, "Item not found")
    return dict(row)

@api.get("/inventory/low-stock")
async def low_stock_alerts(user=Depends(require_role("pharmacist", "admin"))):
    rows = await database.fetch_all(inventory_t.select().where(inventory_t.c.active == True))
    alerts = []
    for r in rows:
        item = dict(r)
        if item["stock_qty"] <= item["reorder_level"]:
            alerts.append({**item, "alert": "low_stock"})
        if item.get("expiry_date"):
            try:
                exp = datetime.strptime(item["expiry_date"], "%Y-%m-%d")
                days_left = (exp - datetime.now()).days
                if days_left <= 30:
                    alerts.append({**item, "alert": "expiring_soon", "days_left": days_left})
            except Exception:
                pass
    return alerts

@api.get("/pharmacy/queue")
async def pharmacy_queue(user=Depends(require_role("pharmacist", "admin"))):
    rows = await database.fetch_all(
        appointments_t.select()
        .where(appointments_t.c.status == "ready_for_pharmacy")
        .order_by(appointments_t.c.queue_number)
    )
    result = []
    for r in rows:
        a = dict(r)
        p = await database.fetch_one(users_t.select().where(users_t.c.id == a["patient_id"]))
        d = await database.fetch_one(users_t.select().where(users_t.c.id == a["doctor_id"]))
        rec = await database.fetch_one(
            records_t.select()
            .where((records_t.c.patient_id == a["patient_id"]) & (records_t.c.appointment_id == a["id"]))
            .order_by(records_t.c.created_at.desc())
        )
        a["patient"] = clean(dict(p)) if p else None
        a["doctor"] = clean(dict(d)) if d else None
        a["record"] = dict(rec) if rec else None
        result.append(a)
    return result

@api.post("/pharmacy/dispense")
async def dispense(body: DispenseIn, user=Depends(require_role("pharmacist", "admin"))):
    appt = await database.fetch_one(
        appointments_t.select().where(appointments_t.c.id == body.appointment_id)
    )
    if not appt or dict(appt)["status"] != "ready_for_pharmacy":
        raise HTTPException(400, "Appointment not ready for pharmacy")

    # Deduct stock for each item
    total_cost = 0.0
    for item in body.items:
        inv_id = item.get("inventory_id")
        qty = int(item.get("qty", 1))
        if inv_id:
            inv_row = await database.fetch_one(
                inventory_t.select().where(inventory_t.c.id == inv_id)
            )
            if inv_row:
                inv = dict(inv_row)
                new_stock = max(0, inv["stock_qty"] - qty)
                await database.execute(
                    inventory_t.update().where(inventory_t.c.id == inv_id)
                    .values(stock_qty=new_stock, updated_at=now_iso())
                )
                total_cost += inv["unit_price"] * qty

    disp_id = uid()
    await database.execute(dispense_t.insert().values(
        id=disp_id, appointment_id=body.appointment_id,
        patient_id=body.patient_id, pharmacist_id=user["id"],
        items=body.items, total_cost=total_cost, dispensed_at=now_iso(),
    ))
    await database.execute(
        appointments_t.update().where(appointments_t.c.id == body.appointment_id)
        .values(status="dispensed", dispensed_at=now_iso(), dispensed_by=user["id"])
    )
    schedule_broadcast({"type": "appointment.updated", "appointment_id": body.appointment_id, "changes": {"status": "dispensed"}})
    return {"ok": True, "dispense_id": disp_id, "total_cost": total_cost}

# ─── Sync status ──────────────────────────────────────────────────────────────
@api.get("/sync/status")
async def sync_status(user=Depends(get_current_user)):
    total = await database.fetch_val(
        text("SELECT COUNT(*) FROM medical_records")
    )
    local = await database.fetch_val(
        text("SELECT COUNT(*) FROM medical_records WHERE sync_status='local'")
    )
    synced = await database.fetch_val(
        text("SELECT COUNT(*) FROM medical_records WHERE sync_status='cloud'")
    )
    last_row = await database.fetch_one(
        records_t.select().where(records_t.c.sync_status == "cloud")
        .order_by(records_t.c.synced_at.desc())
    )
    return {
        "total_records": total or 0,
        "local_ssd": (total or 0) - (synced or 0),
        "cloud": synced or 0,
        "last_synced": dict(last_row).get("synced_at") if last_row else None,
        "ssd_label": "Local NVMe SSD",
        "cloud_label": "AWS RDS",
        "online": True,
    }

# ─── Audit log viewer (admin only) ───────────────────────────────────────────
@api.get("/audit/logs")
async def view_audit_logs(
    limit: int = Query(100, le=500),
    user=Depends(require_role("admin"))
):
    rows = await database.fetch_all(
        audit_t.select().order_by(audit_t.c.timestamp.desc()).limit(limit)
    )
    return [dict(r) for r in rows]

# ─── Seed (idempotent) ────────────────────────────────────────────────────────
@api.post("/seed")
async def seed():
    seeded, skipped = [], []
    demo_users = [
        {"email":"admin@medilink.io","password":"Admin@123","name":"Aria Admin","role":"admin"},
        {"email":"pharmacy@medilink.io","password":"Pharm@123","name":"Pn. Lily Lim","role":"pharmacist"},
        {"email":"dr.tan@medilink.io","password":"Doctor@123","name":"Dr. Wei Tan","role":"doctor","specialty":"General Physician","license_no":"MMC-44219"},
        {"email":"dr.kaur@medilink.io","password":"Doctor@123","name":"Dr. Simran Kaur","role":"doctor","specialty":"Cardiology","license_no":"MMC-55781"},
        {"email":"patient1@medilink.io","password":"Patient@123","name":"Arjun Rao","role":"patient","ic_number":"880421-14-5567","dob":"1988-04-21","gender":"Male","phone":"+60 12-345 6788"},
        {"email":"patient2@medilink.io","password":"Patient@123","name":"Mei Lin Chong","role":"patient","ic_number":"950311-08-2210","dob":"1995-03-11","gender":"Female","phone":"+60 16-998 4422"},
        {"email":"patient3@medilink.io","password":"Patient@123","name":"Hafiz Rahman","role":"patient","ic_number":"720915-10-7733","dob":"1972-09-15","gender":"Male","phone":"+60 19-554 8821"},
    ]
    for u in demo_users:
        existing = await database.fetch_one(users_t.select().where(users_t.c.email == u["email"]))
        if existing:
            skipped.append(u["email"])
            continue
        user_id = uid()
        await database.execute(users_t.insert().values(
            id=user_id, email=u["email"],
            password_hash=hash_password(u["password"]),
            name=u["name"], role=u["role"],
            ic_number=u.get("ic_number"), phone=u.get("phone"),
            dob=u.get("dob"), gender=u.get("gender"),
            specialty=u.get("specialty"), license_no=u.get("license_no"),
            availability=DEFAULT_AVAILABILITY if u["role"]=="doctor" else None,
            slot_minutes=30, facility_id="main", source="seed", created_at=now_iso(),
        ))
        seeded.append(u["email"])

    # Seed demo inventory
    demo_meds = [
        {"name":"Paracetamol 500mg","generic_name":"Acetaminophen","category":"Analgesic","unit":"tablet","stock_qty":500,"reorder_level":100,"unit_price":0.20},
        {"name":"Amoxicillin 250mg","generic_name":"Amoxicillin","category":"Antibiotic","unit":"capsule","stock_qty":200,"reorder_level":50,"unit_price":0.80},
        {"name":"Cetirizine 10mg","generic_name":"Cetirizine","category":"Antihistamine","unit":"tablet","stock_qty":300,"reorder_level":60,"unit_price":0.35},
        {"name":"Metformin 500mg","generic_name":"Metformin HCl","category":"Antidiabetic","unit":"tablet","stock_qty":400,"reorder_level":80,"unit_price":0.45},
        {"name":"Amlodipine 5mg","generic_name":"Amlodipine Besylate","category":"Antihypertensive","unit":"tablet","stock_qty":350,"reorder_level":70,"unit_price":0.55},
        {"name":"Omeprazole 20mg","generic_name":"Omeprazole","category":"PPI","unit":"capsule","stock_qty":250,"reorder_level":50,"unit_price":0.60},
        {"name":"Salbutamol Inhaler","generic_name":"Salbutamol","category":"Bronchodilator","unit":"unit","stock_qty":40,"reorder_level":10,"unit_price":12.50},
        {"name":"ORS Sachet","generic_name":"Oral Rehydration Salts","category":"Rehydration","unit":"sachet","stock_qty":150,"reorder_level":30,"unit_price":0.80},
        {"name":"Ibuprofen 400mg","generic_name":"Ibuprofen","category":"NSAID","unit":"tablet","stock_qty":8,"reorder_level":80,"unit_price":0.30},  # low stock for demo
        {"name":"Azithromycin 250mg","generic_name":"Azithromycin","category":"Antibiotic","unit":"tablet","stock_qty":100,"reorder_level":40,"unit_price":2.20},
    ]
    for med in demo_meds:
        exists = await database.fetch_one(inventory_t.select().where(inventory_t.c.name == med["name"]))
        if not exists:
            await database.execute(inventory_t.insert().values(
                id=uid(), active=True, created_at=now_iso(), updated_at=now_iso(), **med
            ))
    return {"seeded": seeded, "skipped": skipped}

# ─── WebSocket ────────────────────────────────────────────────────────────────
@app.websocket("/api/ws/queue")
async def ws_queue(ws: WebSocket, token: str = Query(...)):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        await ws.close(code=1008)
        return
    user = await database.fetch_one(users_t.select().where(users_t.c.id == payload["sub"]))
    if not user:
        await ws.close(code=1008)
        return
    await ws_manager.connect(ws)
    try:
        await ws.send_json({"type": "hello", "role": dict(user)["role"]})
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)

@api.get("/")
async def root():
    return {"service": "MediLink EHR", "version": "2.0.0", "status": "ok"}

# ─── Startup / Shutdown ───────────────────────────────────────────────────────
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await database.connect()
    # Create all tables
    engine = create_engine(DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://") if "postgresql://" in DATABASE_URL else DATABASE_URL)
    metadata.create_all(engine)
    engine.dispose()
    log.info("Database tables ready")
    # Auto-seed if empty
    count = await database.fetch_val(text("SELECT COUNT(*) FROM users"))
    if not count:
        await seed()
        log.info("Demo data seeded")

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()
