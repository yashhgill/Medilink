"""
MediLink v3.0 — High-Availability Hybrid Cloud EHR Platform
FastAPI | PostgreSQL | Groq AI (MTS Triage) | Malaysian IC | Local payments
HP Folio 9470m (local) ↔ Cloud (Supabase/AWS)
"""
from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, Header,
    Query, WebSocket, WebSocketDisconnect, Request, BackgroundTasks,
)
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from databases import Database
from sqlalchemy import (
    MetaData, Table, Column, String, Float, Integer, Boolean,
    Text, JSON, create_engine, text,
)
from dotenv import load_dotenv
from pathlib import Path
import os, logging, asyncio, uuid, json, re, io, base64, httpx, hmac, time
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Literal, Set
from pydantic import BaseModel, Field, EmailStr
import bcrypt, jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ── Config ────────────────────────────────────────────────────────────────────
DATABASE_URL    = os.environ["DATABASE_URL"]
JWT_SECRET      = os.environ["JWT_SECRET"]
GROQ_API_KEY    = os.environ.get("GROQ_API_KEY", "")
CLOUD_DB_URL    = os.environ.get("CLOUD_DATABASE_URL", "")   # Supabase/AWS RDS
JWT_ALG         = "HS256"
JWT_EXP_HOURS   = 24 * 7
CLINIC_NAME     = os.environ.get("CLINIC_NAME", "MediLink Clinic")
CLINIC_ADDR     = os.environ.get("CLINIC_ADDRESS", "")
CLINIC_PHONE    = os.environ.get("CLINIC_PHONE", "")
FACILITY_ID     = os.environ.get("FACILITY_ID", "main")
IS_CLOUD        = os.environ.get("IS_CLOUD_NODE", "false").lower() == "true"
KIOSK_TOKEN     = os.environ.get("KIOSK_TOKEN", "")          # shared secret for kiosk devices
ALLOW_SEED      = os.environ.get("ALLOW_SEED", "false").lower() == "true"
STAFF_JWT_EXP_HOURS = int(os.environ.get("STAFF_JWT_EXP_HOURS", "12"))
SYNC_INTERVAL   = int(os.environ.get("SYNC_INTERVAL_SECONDS", "30"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s | %(message)s")
log = logging.getLogger("medilink")

# ── Database ──────────────────────────────────────────────────────────────────
database = Database(DATABASE_URL)
metadata = MetaData()

# Cloud DB for sync (only on local node)
cloud_db: Optional[Database] = Database(CLOUD_DB_URL) if CLOUD_DB_URL and not IS_CLOUD else None

# ── Tables ────────────────────────────────────────────────────────────────────
users_t = Table("users", metadata,
    Column("id", String, primary_key=True),
    Column("email", String, unique=True, nullable=False),
    Column("password_hash", String, nullable=False),
    Column("name", String, nullable=False),
    Column("role", String, nullable=False),
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
    Column("updated_at", String),
    Column("sync_status", String, default="local"),
    Column("synced_at", String),
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
    Column("triage_colour", String),        # Red | Yellow | Green (MTS zones)
    Column("triage_category", String),
    Column("triage_target_mins", Integer),
    Column("duration_minutes", Integer, default=30),
    Column("created_at", String),
    Column("updated_at", String),
    Column("created_by", String),
    Column("dispensed_at", String),
    Column("dispensed_by", String),
    Column("facility_id", String, default="main"),
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
    Column("triage_colour", String),
    Column("triage_target_mins", Integer),
    Column("triage_red_flags", JSON),
    Column("attachment_ids", JSON),
    Column("created_at", String),
    Column("updated_at", String),
    Column("sync_status", String, default="local"),
    Column("synced_at", String),
)

payments_t = Table("payments", metadata,
    Column("id", String, primary_key=True),
    Column("appointment_id", String),
    Column("amount", Float),
    Column("method", String),
    Column("status", String),
    Column("txn_ref", String),
    Column("paid_by", String),
    Column("paid_at", String),
    Column("receipt_data", JSON),
    Column("facility_id", String, default="main"),
    Column("source", String, default="web"),
    Column("sync_status", String, default="local"),
    Column("synced_at", String),
)

inventory_t = Table("pharmacy_inventory", metadata,
    Column("id", String, primary_key=True),
    Column("name", String, nullable=False),
    Column("generic_name", String),
    Column("category", String),
    Column("unit", String),
    Column("stock_qty", Integer, default=0),
    Column("reorder_level", Integer, default=50),
    Column("unit_price", Float, default=0.0),
    Column("expiry_date", String),
    Column("batch_no", String),
    Column("supplier", String),
    Column("active", Boolean, default=True),
    Column("facility_id", String, default="main"),
    Column("created_at", String),
    Column("updated_at", String),
    Column("sync_status", String, default="local"),
    Column("synced_at", String),
)

dispense_t = Table("dispense_records", metadata,
    Column("id", String, primary_key=True),
    Column("appointment_id", String),
    Column("patient_id", String),
    Column("pharmacist_id", String),
    Column("items", JSON),
    Column("total_cost", Float),
    Column("dispensed_at", String),
    Column("facility_id", String, default="main"),
    Column("sync_status", String, default="local"),
    Column("synced_at", String),
)

audit_t = Table("audit_logs", metadata,
    Column("id", String, primary_key=True),
    Column("user_id", String),
    Column("user_role", String),
    Column("action", String),
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

sync_queue_t = Table("sync_queue", metadata,
    Column("id", String, primary_key=True),
    Column("table_name", String),
    Column("record_id", String),
    Column("operation", String),   # INSERT | UPDATE | DELETE
    Column("payload", JSON),
    Column("created_at", String),
    Column("attempted_at", String),
    Column("attempts", Integer, default=0),
    Column("synced", Boolean, default=False),
    Column("error", String),
)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="MediLink EHR", version="3.0.0", docs_url="/docs")
api = APIRouter(prefix="/api")

# ── Core helpers ──────────────────────────────────────────────────────────────
def uid() -> str: return str(uuid.uuid4())
def now_iso() -> str: return datetime.now(timezone.utc).isoformat()

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_pw(pw: str, hashed: str) -> bool:
    try: return bcrypt.checkpw(pw.encode(), hashed.encode())
    except: return False

def make_token(uid_: str, role: str) -> str:
    # Staff sessions expire quickly (default 12h); patient app sessions last longer.
    hours = JWT_EXP_HOURS if role == "patient" else STAFF_JWT_EXP_HOURS
    return jwt.encode(
        {"sub": uid_, "role": role, "exp": datetime.now(timezone.utc) + timedelta(hours=hours)},
        JWT_SECRET, algorithm=JWT_ALG,
    )

def clean(d: dict) -> dict:
    if not d: return d
    r = dict(d); r.pop("password_hash", None); return r

# ── NRIC parser ───────────────────────────────────────────────────────────────
NRIC_RE = re.compile(r"^(\d{2})(\d{2})(\d{2})-?(\d{2})-?(\d{4})$")
STATE_MAP = {
    "01":"Johor","02":"Kedah","03":"Kelantan","04":"Melaka",
    "05":"Negeri Sembilan","06":"Pahang","07":"Pulau Pinang","08":"Perak",
    "09":"Perlis","10":"Selangor","11":"Terengganu","12":"Sabah","13":"Sarawak",
    "14":"WP Kuala Lumpur","15":"WP Labuan","16":"WP Putrajaya",
}

def parse_ic(ic: str) -> dict:
    cleaned = ic.strip().replace(" ", "").replace("-", "")
    # re-attach dashes for matching
    if len(cleaned) == 12:
        cleaned = f"{cleaned[:6]}-{cleaned[6:8]}-{cleaned[8:]}"
    m = NRIC_RE.match(cleaned.replace("-","") and cleaned)
    if not m:
        m = NRIC_RE.match(cleaned)
    if not m:
        return {"valid": False, "formatted": ic.strip(), "error": "Format must be YYMMDD-SS-NNNN"}
    yy, mm, dd, state_code, seq = m.groups()
    curr_yy = datetime.now().year % 100
    full_year = (1900 + int(yy)) if int(yy) > curr_yy else (2000 + int(yy))
    try:
        dob_dt = datetime(full_year, int(mm), int(dd))
        age = (datetime.now() - dob_dt).days // 365
    except ValueError:
        return {"valid": False, "formatted": ic.strip(), "error": "Invalid date in IC"}
    return {
        "valid": True,
        "formatted": f"{yy}{mm}{dd}-{state_code}-{seq}",
        "dob": dob_dt.strftime("%Y-%m-%d"),
        "age": age,
        "state": STATE_MAP.get(state_code, f"State {state_code}"),
        "state_code": state_code,
        "gender_hint": "Male" if int(seq[-1]) % 2 == 1 else "Female",
    }

# ── Auth ──────────────────────────────────────────────────────────────────────
async def current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1], JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    row = await database.fetch_one(users_t.select().where(users_t.c.id == payload["sub"]))
    if not row: raise HTTPException(401, "User not found")
    return clean(dict(row))

def role_required(*roles: str):
    async def dep(u=Depends(current_user)):
        if u["role"] not in roles:
            raise HTTPException(403, f"Requires: {roles}")
        return u
    return dep

# ── Kiosk device auth ────────────────────────────────────────────────────────
# Kiosk endpoints are unauthenticated for patients but must come from a trusted
# device. Each kiosk sends X-Kiosk-Token (shared secret from env). If KIOSK_TOKEN
# is unset we allow requests but log loudly — dev mode only, never production.
async def kiosk_auth(x_kiosk_token: Optional[str] = Header(None)):
    if KIOSK_TOKEN:
        if not x_kiosk_token or not hmac.compare_digest(x_kiosk_token, KIOSK_TOKEN):
            raise HTTPException(401, "Kiosk device not authorised")
    else:
        log.warning("KIOSK_TOKEN not set — kiosk endpoints are UNPROTECTED (dev mode only)")

# ── Login brute-force guard (per email+IP, in-memory sliding window) ─────────
_login_fails: dict = {}
LOGIN_MAX_FAILS, LOGIN_WINDOW_S = 5, 900

def login_guard(key: str):
    now_ts = time.time()
    _login_fails[key] = [t for t in _login_fails.get(key, []) if now_ts - t < LOGIN_WINDOW_S]
    if len(_login_fails[key]) >= LOGIN_MAX_FAILS:
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")

def login_fail(key: str):
    _login_fails.setdefault(key, []).append(time.time())


# ── Audit ─────────────────────────────────────────────────────────────────────
async def audit_log(user_id: str, role: str, action: str, resource: str,
                    resource_id: str = "", ip: str = ""):
    try:
        await database.execute(audit_t.insert().values(
            id=uid(), user_id=user_id, user_role=role, action=action,
            resource=resource, resource_id=resource_id,
            facility_id=FACILITY_ID, ip_address=ip, timestamp=now_iso(),
        ))
    except Exception as e:
        log.warning(f"Audit log failed: {e}")

# ── Sync queue helper ─────────────────────────────────────────────────────────
async def enqueue_sync(table: str, record_id: str, operation: str, payload: dict):
    """Add a record to the sync queue for cloud replication."""
    try:
        await database.execute(sync_queue_t.insert().values(
            id=uid(), table_name=table, record_id=record_id,
            operation=operation, payload=payload,
            created_at=now_iso(), attempts=0, synced=False,
        ))
    except Exception as e:
        log.warning(f"Sync enqueue failed: {e}")

# ── WebSocket manager ─────────────────────────────────────────────────────────
class WSManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, event: dict):
        dead = []
        for ws in list(self.active):
            try: await ws.send_json(event)
            except: dead.append(ws)
        for d in dead: self.active.discard(d)

ws_mgr = WSManager()
def broadcast(event: dict): asyncio.create_task(ws_mgr.broadcast(event))

# ── Queue counter ─────────────────────────────────────────────────────────────
async def next_q() -> int:
    key = f"queue-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    row = await database.fetch_one(counters_t.select().where(counters_t.c.key == key))
    if row:
        n = row["value"] + 1
        await database.execute(counters_t.update().where(counters_t.c.key == key).values(value=n))
        return n
    await database.execute(counters_t.insert().values(key=key, value=1))
    return 1

# ── DuitNow QR ────────────────────────────────────────────────────────────────
def make_duitnow_qr(amount: float, ref: str) -> str:
    try:
        import qrcode
        qr = qrcode.QRCode(version=2, box_size=6, border=2)
        qr.add_data(f"DUITNOW|{CLINIC_NAME}|{ref}|MYR{amount:.2f}")
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO(); img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    except: return ""

# ── Groq AI ───────────────────────────────────────────────────────────────────
async def groq(system: str, messages: list, max_tokens: int = 600,
               temperature: float = 0.2, response_format: str = "text") -> str:
    if not GROQ_API_KEY:
        raise HTTPException(503, "GROQ_API_KEY not configured")
    try:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=GROQ_API_KEY)
        kwargs = dict(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system}, *messages],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if response_format == "json":
            kwargs["response_format"] = {"type": "json_object"}
        resp = await client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content
    except HTTPException: raise
    except Exception as e:
        log.exception("Groq error")
        raise HTTPException(502, f"AI service error: {e}")

async def groq_stream(system: str, messages: list):
    if not GROQ_API_KEY:
        yield "data: [ERROR] AI not configured\n\n"; return
    try:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=GROQ_API_KEY)
        stream = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system}, *messages],
            max_tokens=512, temperature=0.4, stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta: yield f"data: {json.dumps(delta)}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: [ERROR] {str(e)}\n\n"

# ── Pydantic models ───────────────────────────────────────────────────────────
Role = Literal["patient","doctor","admin","pharmacist","receptionist"]

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
    fee: Optional[float] = None

class KioskRegisterIn(BaseModel):
    ic_number: str
    name: str
    phone: Optional[str] = None
    email: Optional[EmailStr] = None

class KioskCheckinIn(BaseModel):
    ic_number: str
    doctor_id: Optional[str] = None
    reason: Optional[str] = "Walk-in consultation"
    fee: float = 50.0
    symptoms: Optional[str] = None      # "how are you feeling" free text
    pain_score: Optional[int] = None    # 0-10

class KioskPayIn(BaseModel):
    ic_number: str
    appointment_id: str
    method: Literal["duitnow","tng","bank","cash"] = "duitnow"

class VitalSigns(BaseModel):
    bp: Optional[str] = None          # e.g. "120/80"
    hr: Optional[int] = None          # bpm
    temp: Optional[float] = None      # °C
    weight: Optional[float] = None    # kg
    height: Optional[float] = None    # cm
    spo2: Optional[int] = None        # %
    rr: Optional[int] = None          # respiratory rate

class PrescriptionItem(BaseModel):
    medicine: str
    dosage: str
    frequency: str
    duration: str
    notes: Optional[str] = None
    inventory_id: Optional[str] = None

class MedicalRecordIn(BaseModel):
    patient_id: str
    appointment_id: Optional[str] = None
    vitals: Optional[VitalSigns] = None
    diagnosis: str
    notes: Optional[str] = None
    prescriptions: List[PrescriptionItem] = []
    allergies: Optional[str] = None
    # Triage result can be saved with record
    triage_category: Optional[str] = None
    triage_colour: Optional[str] = None
    triage_target_mins: Optional[int] = None
    triage_red_flags: Optional[List[str]] = None

class TriageIn(BaseModel):
    patient_id: str
    chief_complaint: str
    vitals: Optional[VitalSigns] = None
    pain_score: Optional[int] = Field(None, ge=0, le=10)
    duration: Optional[str] = None          # "2 hours", "3 days"
    history: Optional[str] = None
    known_conditions: Optional[str] = None  # "diabetic, hypertensive"
    allergies: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None

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
    items: List[Dict[str, Any]]

class AISymptomIn(BaseModel):
    message: str
    history: List[Dict[str, str]] = []
    patient_context: Optional[str] = None  # age, known conditions

class AISummaryIn(BaseModel):
    patient_id: str

class AIDrugCheckIn(BaseModel):
    medicines: List[str]
    patient_age: Optional[int] = None
    known_conditions: Optional[str] = None

DEFAULT_AVAIL = {
    "mon":"09:00-17:00","tue":"09:00-17:00","wed":"09:00-17:00",
    "thu":"09:00-17:00","fri":"09:00-17:00","sat":"10:00-13:00","sun":"",
}

# ── Patient helpers ───────────────────────────────────────────────────────────
async def patient_by_ic(ic: str):
    parsed = parse_ic(ic)
    search_ic = parsed["formatted"] if parsed["valid"] else ic.strip()
    return await database.fetch_one(
        users_t.select().where(users_t.c.ic_number == search_ic)
    )

async def enrich_appointments(rows) -> list:
    result = []
    for r in rows:
        a = dict(r)
        p = await database.fetch_one(users_t.select().where(users_t.c.id == a["patient_id"])) if a.get("patient_id") else None
        d = await database.fetch_one(users_t.select().where(users_t.c.id == a["doctor_id"])) if a.get("doctor_id") else None
        a["patient"] = clean(dict(p)) if p else None
        a["doctor"] = clean(dict(d)) if d else None
        result.append(a)
    return result

# ════════════════════════════════════════════════════════════════════════════
# ROUTES
# ════════════════════════════════════════════════════════════════════════════

# ── Public ────────────────────────────────────────────────────────────────────
@api.get("/")
async def root():
    return {"service": "MediLink EHR", "version": "3.0.0",
            "facility": FACILITY_ID, "node": "cloud" if IS_CLOUD else "local", "status": "ok"}

@api.get("/ic/parse/{ic_number}")
async def ic_parse(ic_number: str):
    return parse_ic(ic_number)

@api.get("/health")
async def health():
    try:
        await database.fetch_val(text("SELECT 1"))
        db_ok = True
    except: db_ok = False
    return {"ok": db_ok, "ts": now_iso(), "node": "cloud" if IS_CLOUD else "local"}

# ── Auth ──────────────────────────────────────────────────────────────────────
@api.post("/auth/register", status_code=201)
async def register(body: RegisterIn):
    if await database.fetch_one(users_t.select().where(users_t.c.email == body.email.lower())):
        raise HTTPException(400, "Email already registered")
    ic = body.ic_number
    dob, gender = body.dob, body.gender
    if body.role == "patient" and ic:
        p = parse_ic(ic)
        if p["valid"]:
            ic = p["formatted"]
            dob = dob or p.get("dob")
            gender = gender or p.get("gender_hint")
    uid_ = uid()
    now = now_iso()
    await database.execute(users_t.insert().values(
        id=uid_, email=body.email.lower(), password_hash=hash_pw(body.password),
        name=body.name, role=body.role, ic_number=ic, phone=body.phone,
        dob=dob, gender=gender, specialty=body.specialty, license_no=body.license_no,
        availability=DEFAULT_AVAIL if body.role == "doctor" else None,
        slot_minutes=30, facility_id=FACILITY_ID, source="web",
        created_at=now, updated_at=now, sync_status="local",
    ))
    user = clean(dict(await database.fetch_one(users_t.select().where(users_t.c.id == uid_))))
    await enqueue_sync("users", uid_, "INSERT", user)
    return {"token": make_token(uid_, body.role), "user": user}

@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    ip = request.client.host if request.client else ""
    guard_key = f"{body.email.lower()}|{ip}"
    login_guard(guard_key)
    row = await database.fetch_one(users_t.select().where(users_t.c.email == body.email.lower()))
    if not row or not verify_pw(body.password, row["password_hash"]):
        login_fail(guard_key)
        await audit_log(row["id"] if row else "unknown", row["role"] if row else "unknown",
                        "LOGIN_FAILED", "auth", ip=ip)
        raise HTTPException(401, "Invalid credentials")
    await audit_log(row["id"], row["role"], "LOGIN", "auth",
                    ip=request.client.host if request.client else "")
    return {"token": make_token(row["id"], row["role"]), "user": clean(dict(row))}

@api.get("/auth/me")
async def me(u=Depends(current_user)):
    return u

@api.patch("/auth/me/password")
async def change_password(body: dict, u=Depends(current_user)):
    old, new = body.get("old_password",""), body.get("new_password","")
    row = await database.fetch_one(users_t.select().where(users_t.c.id == u["id"]))
    if not verify_pw(old, row["password_hash"]):
        raise HTTPException(400, "Current password incorrect")
    if len(new) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    await database.execute(users_t.update().where(users_t.c.id == u["id"])
        .values(password_hash=hash_pw(new), updated_at=now_iso()))
    return {"ok": True}

# ── Users / Patients ──────────────────────────────────────────────────────────
@api.get("/patients")
async def list_patients(search: Optional[str] = None, u=Depends(current_user)):
    if u["role"] == "patient": raise HTTPException(403, "Forbidden")
    q = users_t.select().where(users_t.c.role == "patient").order_by(users_t.c.name)
    rows = await database.fetch_all(q)
    patients = [clean(dict(r)) for r in rows]
    if search:
        s = search.lower()
        patients = [p for p in patients if
                    s in p.get("name","").lower() or
                    s in (p.get("ic_number") or "").lower() or
                    s in (p.get("phone") or "").lower()]
    return patients

@api.get("/patients/{patient_id}")
async def get_patient(patient_id: str, u=Depends(current_user), request: Request = None):
    row = await database.fetch_one(
        users_t.select().where((users_t.c.id == patient_id) & (users_t.c.role == "patient"))
    )
    if not row: raise HTTPException(404, "Patient not found")
    if u["role"] == "patient" and u["id"] != patient_id:
        raise HTTPException(403, "Forbidden")
    await audit_log(u["id"], u["role"], "READ_PATIENT", "users", patient_id,
                    ip=request.client.host if request and request.client else "")
    return clean(dict(row))

@api.patch("/patients/{patient_id}")
async def update_patient(patient_id: str, body: dict, u=Depends(current_user)):
    if u["role"] == "patient" and u["id"] != patient_id:
        raise HTTPException(403, "Forbidden")
    allowed = {"name","phone","dob","gender","email"}
    updates = {k: v for k, v in body.items() if k in allowed}
    updates["updated_at"] = now_iso()
    await database.execute(users_t.update().where(users_t.c.id == patient_id).values(**updates))
    row = await database.fetch_one(users_t.select().where(users_t.c.id == patient_id))
    return clean(dict(row))

@api.get("/doctors")
async def list_doctors(u=Depends(current_user)):
    rows = await database.fetch_all(users_t.select().where(users_t.c.role == "doctor"))
    return [clean(dict(r)) for r in rows]

# ── Kiosk (public — no auth) ──────────────────────────────────────────────────
@api.get("/kiosk/lookup/{ic_number}")
async def kiosk_lookup(ic_number: str, _=Depends(kiosk_auth)):
    p = await patient_by_ic(ic_number)
    if not p: raise HTTPException(404, "No patient registered with this IC")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    appts_rows = await database.fetch_all(
        appointments_t.select()
        .where((appointments_t.c.patient_id == p["id"]) &
               (appointments_t.c.scheduled_at.like(f"{today}%")))
        .order_by(appointments_t.c.queue_number)
    )
    appts = await enrich_appointments(appts_rows)
    return {"patient": clean(dict(p)), "today_appointments": appts, "ic_info": parse_ic(ic_number)}

@api.post("/kiosk/register", status_code=201)
async def kiosk_register(body: KioskRegisterIn, _=Depends(kiosk_auth)):
    parsed = parse_ic(body.ic_number)
    if not parsed["valid"]:
        raise HTTPException(400, f"Invalid IC: {parsed.get('error','format must be YYMMDD-SS-NNNN')}")
    if await patient_by_ic(body.ic_number):
        raise HTTPException(400, "Patient with this IC already registered. Please check in instead.")
    email = (body.email or f"{parsed['formatted'].replace('-','').lower()}@patient.medilink").lower()
    if await database.fetch_one(users_t.select().where(users_t.c.email == email)):
        email = f"{parsed['formatted'].replace('-','').lower()}.{uid()[:6]}@patient.medilink"
    uid_ = uid(); now = now_iso()
    await database.execute(users_t.insert().values(
        id=uid_, email=email,
        password_hash=hash_pw(f"IC{parsed['formatted'].replace('-','')[:8]}#"),
        name=body.name, role="patient",
        ic_number=parsed["formatted"], phone=body.phone,
        dob=parsed.get("dob"), gender=parsed.get("gender_hint"),
        facility_id=FACILITY_ID, source="kiosk",
        created_at=now, updated_at=now, sync_status="local",
    ))
    user = clean(dict(await database.fetch_one(users_t.select().where(users_t.c.id == uid_))))
    await enqueue_sync("users", uid_, "INSERT", user)
    return {"patient": user, "ic_info": parsed,
            "login_hint": f"Default password: IC{parsed['formatted'].replace('-','')[:8]}#"}

async def kiosk_triage(symptoms: str, pain_score, patient: dict) -> dict:
    """Run MTS triage on kiosk-reported symptoms. Fail-safe: Green on any error."""
    fallback = {"colour": "Green", "category": "Non-critical", "target_wait_minutes": 120}
    if not symptoms or not GROQ_API_KEY:
        return fallback
    try:
        prompt = f"""PATIENT: DOB {patient.get('dob','Unknown')}, Gender: {patient.get('gender','Unknown')}
CHIEF COMPLAINT (self-reported at kiosk): {symptoms}
PAIN SCORE: {pain_score if pain_score is not None else 'Not assessed'}/10
VITAL SIGNS: Not recorded (kiosk self check-in)

Apply MTS strictly. This is self-reported — if red-flag symptoms are described (chest pain, breathlessness, severe bleeding, stroke signs, unconsciousness), escalate. Output JSON only."""
        raw = await groq(MTS_SYSTEM, [{"role": "user", "content": prompt}],
                         max_tokens=400, temperature=0.1, response_format="json")
        r = json.loads(raw.strip().lstrip("```json").rstrip("```").strip())
        if r.get("colour") in ("Red", "Yellow", "Green"):
            return r
        return fallback
    except Exception as e:
        log.warning(f"Kiosk triage failed, defaulting Green: {e}")
        return fallback

@api.post("/kiosk/checkin")
async def kiosk_checkin(body: KioskCheckinIn, _=Depends(kiosk_auth)):
    p = await patient_by_ic(body.ic_number)
    if not p: raise HTTPException(404, "Patient not registered. Please register first.")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Check for existing today appointment
    existing = await database.fetch_one(
        appointments_t.select().where(
            (appointments_t.c.patient_id == p["id"]) &
            (appointments_t.c.scheduled_at.like(f"{today}%")) &
            appointments_t.c.status.in_(["scheduled","checked_in"])
        ).order_by(appointments_t.c.scheduled_at)
    )
    if existing:
        appt = dict(existing)
        if appt["status"] == "scheduled":
            upd = {"status": "checked_in", "updated_at": now_iso()}
            if body.symptoms:
                triage = await kiosk_triage(body.symptoms, body.pain_score, dict(p))
                upd.update(reason=body.symptoms.strip(), triage_colour=triage.get("colour"),
                           triage_category=triage.get("category"),
                           triage_target_mins=triage.get("target_wait_minutes"))
            await database.execute(
                appointments_t.update().where(appointments_t.c.id == appt["id"]).values(**upd)
            )
            appt.update(upd)
            broadcast({"type":"appointment.updated","appointment_id":appt["id"],"changes":{"status":"checked_in"}})
    else:
        # Walk-in — auto-assign doctor
        doc_row = None
        if body.doctor_id:
            doc_row = await database.fetch_one(
                users_t.select().where((users_t.c.id == body.doctor_id) & (users_t.c.role == "doctor"))
            )
        if not doc_row:
            doc_row = await database.fetch_one(users_t.select().where(users_t.c.role == "doctor"))
        if not doc_row: raise HTTPException(503, "No doctors configured in system")
        q = await next_q(); appt_id = uid(); now = now_iso()
        triage = await kiosk_triage(body.symptoms, body.pain_score, dict(p))
        reason_txt = body.symptoms.strip() if body.symptoms else (body.reason or "Walk-in consultation")
        appt = dict(
            id=appt_id, patient_id=p["id"], doctor_id=doc_row["id"],
            scheduled_at=now, reason=reason_txt,
            triage_colour=triage.get("colour"), triage_category=triage.get("category"),
            triage_target_mins=triage.get("target_wait_minutes"),
            fee=body.fee, status="checked_in", queue_number=q,
            payment_status="unpaid", created_at=now, updated_at=now,
            created_by="kiosk", facility_id=FACILITY_ID,
            source="kiosk", sync_status="local",
        )
        await database.execute(appointments_t.insert().values(**appt))
        await enqueue_sync("appointments", appt_id, "INSERT", appt)
        broadcast({"type":"appointment.created","appointment_id":appt_id})

    doc_row = await database.fetch_one(users_t.select().where(users_t.c.id == appt["doctor_id"]))
    doc = clean(dict(doc_row)) if doc_row else {}
    chit = {
        "type":"QUEUE", "clinic_name":CLINIC_NAME,
        "patient_name":p["name"], "patient_ic":p["ic_number"],
        "queue_number":appt["queue_number"],
        "doctor_name":doc.get("name","-"), "doctor_specialty":doc.get("specialty","General"),
        "reason":appt["reason"], "issued_at":now_iso(), "appointment_id":appt["id"],
        "triage_colour":appt.get("triage_colour"), "triage_category":appt.get("triage_category"),
    }
    return {"appointment":appt, "patient":clean(dict(p)), "doctor":doc, "chit":chit}

@api.post("/kiosk/pay")
async def kiosk_pay(body: KioskPayIn, _=Depends(kiosk_auth)):
    p = await patient_by_ic(body.ic_number)
    if not p: raise HTTPException(404, "Patient not found")
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
    # Build payment info
    if body.method == "duitnow":
        payment_info = {"type":"DuitNow QR","ref":txn_ref,"qr":make_duitnow_qr(amount,txn_ref)}
    elif body.method == "tng":
        payment_info = {"type":"Touch 'n Go","deeplink":f"tngd://pay?amount={amount:.2f}&ref={txn_ref}","ref":txn_ref}
    elif body.method == "bank":
        payment_info = {"type":"Bank Transfer","account_name":CLINIC_NAME,
                        "account_no":os.environ.get("BANK_ACCOUNT_NO","1234567890"),
                        "bank":os.environ.get("BANK_NAME","Maybank"),"ref":txn_ref,"amount":amount}
    else:
        payment_info = {"type":"Cash","ref":txn_ref,"amount":amount}

    pay_id = uid(); now = now_iso()
    is_instant = body.method == "cash"
    await database.execute(payments_t.insert().values(
        id=pay_id, appointment_id=appt["id"], amount=amount, method=body.method,
        status="succeeded" if is_instant else "pending",
        txn_ref=txn_ref, paid_by="kiosk", paid_at=now,
        receipt_data=payment_info, facility_id=FACILITY_ID,
        source="kiosk", sync_status="local",
    ))
    new_appt_status = "ready_for_pharmacy" if is_instant else appt["status"]
    await database.execute(
        appointments_t.update().where(appointments_t.c.id == appt["id"]).values(
            payment_status="paid" if is_instant else "pending",
            payment_method=body.method, payment_ref=txn_ref,
            paid_amount=amount, status=new_appt_status, updated_at=now,
        )
    )
    broadcast({"type":"appointment.updated","appointment_id":appt["id"]})
    # Fetch prescriptions for medicine chit
    rec = await database.fetch_one(
        records_t.select()
        .where((records_t.c.patient_id == p["id"]) & (records_t.c.appointment_id == appt["id"]))
        .order_by(records_t.c.created_at.desc())
    )
    prescriptions = (dict(rec).get("prescriptions") or []) if rec else []
    doc_row = await database.fetch_one(users_t.select().where(users_t.c.id == appt["doctor_id"]))
    receipt = {
        "type":"RECEIPT","clinic_name":CLINIC_NAME,"clinic_address":CLINIC_ADDR,
        "clinic_phone":CLINIC_PHONE,"patient_name":p["name"],"patient_ic":p["ic_number"],
        "amount":amount,"method":body.method,"txn_ref":txn_ref,"paid_at":now,"appointment_id":appt["id"],
    }
    medicine_chit = {
        "type":"MEDICINE","clinic_name":f"{CLINIC_NAME} — Pharmacy",
        "patient_name":p["name"],"patient_ic":p["ic_number"],
        "queue_number":appt["queue_number"],
        "doctor_name":doc_row["name"] if doc_row else "-",
        "prescriptions":prescriptions,"appointment_id":appt["id"],"issued_at":now,
    }
    return {"appointment":appt,"payment":payment_info,"receipt":receipt,"medicine_chit":medicine_chit}

@api.post("/kiosk/payment-confirm/{txn_ref}")
async def confirm_payment(txn_ref: str, _=Depends(kiosk_auth)):
    pay_row = await database.fetch_one(payments_t.select().where(payments_t.c.txn_ref == txn_ref))
    if not pay_row: raise HTTPException(404, "Transaction not found")
    if pay_row["status"] == "succeeded":          # idempotent — already confirmed
        return {"ok": True, "txn_ref": txn_ref, "already_confirmed": True}
    if pay_row["status"] not in ("pending", "initiated"):
        raise HTTPException(409, f"Cannot confirm payment in status {pay_row['status']}")
    now = now_iso()
    await database.execute(payments_t.update().where(payments_t.c.txn_ref == txn_ref)
        .values(status="succeeded"))
    await database.execute(
        appointments_t.update().where(appointments_t.c.id == pay_row["appointment_id"])
        .values(payment_status="paid", status="ready_for_pharmacy", updated_at=now)
    )
    broadcast({"type":"appointment.updated","appointment_id":pay_row["appointment_id"]})
    return {"ok":True,"txn_ref":txn_ref}

# ── Appointments ──────────────────────────────────────────────────────────────
@api.post("/appointments", status_code=201)
async def create_appointment(body: AppointmentIn, u=Depends(current_user)):
    q = await next_q(); appt_id = uid(); now = now_iso()
    appt = dict(
        id=appt_id, patient_id=body.patient_id, doctor_id=body.doctor_id,
        scheduled_at=body.scheduled_at, reason=body.reason, fee=body.fee,
        status="scheduled", queue_number=q, payment_status="unpaid",
        created_at=now, updated_at=now, created_by=u["id"],
        facility_id=FACILITY_ID, source="web", sync_status="local",
    )
    await database.execute(appointments_t.insert().values(**appt))
    await enqueue_sync("appointments", appt_id, "INSERT", appt)
    broadcast({"type":"appointment.created","appointment_id":appt_id})
    return appt

@api.get("/appointments")
async def list_appointments(date: Optional[str] = None, u=Depends(current_user)):
    q = appointments_t.select()
    if u["role"] == "patient":
        q = q.where(appointments_t.c.patient_id == u["id"])
    elif u["role"] == "doctor":
        q = q.where(appointments_t.c.doctor_id == u["id"])
    if date:
        q = q.where(appointments_t.c.scheduled_at.like(f"{date}%"))
    rows = await database.fetch_all(q.order_by(appointments_t.c.scheduled_at.desc()))
    return await enrich_appointments(rows)

@api.get("/queue/today")
async def todays_queue(u=Depends(current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = await database.fetch_all(
        appointments_t.select()
        .where(appointments_t.c.scheduled_at.like(f"{today}%"))
        .where(~appointments_t.c.is_block)
    )
    # Malaysian triage ordering: Red first, then Yellow, Green, untriaged; FIFO within zone
    prio = {"Red": 0, "Yellow": 1, "Green": 2}
    rows = sorted(rows, key=lambda r: (prio.get(r["triage_colour"], 3), r["queue_number"] or 0))
    return await enrich_appointments(rows)

@api.patch("/appointments/{appt_id}")
async def update_appointment(appt_id: str, body: AppointmentUpdate, u=Depends(current_user)):
    updates = {k:v for k,v in body.model_dump().items() if v is not None}
    if not updates: raise HTTPException(400, "Nothing to update")
    updates["updated_at"] = now_iso()
    await database.execute(appointments_t.update()
        .where(appointments_t.c.id == appt_id).values(**updates))
    row = await database.fetch_one(appointments_t.select().where(appointments_t.c.id == appt_id))
    if not row: raise HTTPException(404, "Appointment not found")
    await enqueue_sync("appointments", appt_id, "UPDATE", dict(row))
    broadcast({"type":"appointment.updated","appointment_id":appt_id,"changes":updates})
    return dict(row)

@api.delete("/appointments/{appt_id}")
async def delete_appointment(appt_id: str, u=Depends(current_user)):
    row = await database.fetch_one(appointments_t.select().where(appointments_t.c.id == appt_id))
    if not row: raise HTTPException(404, "Not found")
    appt = dict(row)
    if u["role"] == "doctor" and (appt.get("doctor_id") != u["id"] or not appt.get("is_block")):
        raise HTTPException(403, "Doctors can only delete their own time blocks")
    elif u["role"] not in ("admin","doctor"):
        raise HTTPException(403, "Forbidden")
    await database.execute(appointments_t.delete().where(appointments_t.c.id == appt_id))
    broadcast({"type":"appointment.deleted","appointment_id":appt_id})
    return {"ok":True}

@api.post("/appointments/block")
async def block_time(body: BlockTimeIn, u=Depends(role_required("doctor","admin"))):
    bid = uid(); q = await next_q(); now = now_iso()
    await database.execute(appointments_t.insert().values(
        id=bid, patient_id=None, doctor_id=u["id"],
        scheduled_at=body.scheduled_at, reason=body.reason,
        fee=0, status="cancelled", queue_number=q,
        payment_status="n/a", is_block=True,
        duration_minutes=body.duration_minutes,
        created_at=now, updated_at=now, created_by=u["id"],
        facility_id=FACILITY_ID, source="web", sync_status="local",
    ))
    broadcast({"type":"appointment.created","appointment_id":bid})
    return dict(await database.fetch_one(appointments_t.select().where(appointments_t.c.id == bid)))

# ── Medical records ───────────────────────────────────────────────────────────
@api.post("/records", status_code=201)
async def create_record(body: MedicalRecordIn, u=Depends(role_required("doctor","admin")),
                        request: Request = None):
    rec_id = uid(); now = now_iso()
    vitals = body.vitals.model_dump() if body.vitals else None
    await database.execute(records_t.insert().values(
        id=rec_id, patient_id=body.patient_id, doctor_id=u["id"],
        appointment_id=body.appointment_id, facility_id=FACILITY_ID,
        vitals=vitals, diagnosis=body.diagnosis, notes=body.notes,
        prescriptions=[p.model_dump() for p in body.prescriptions],
        allergies=body.allergies,
        triage_category=body.triage_category,
        triage_colour=body.triage_colour,
        triage_target_mins=body.triage_target_mins,
        triage_red_flags=body.triage_red_flags or [],
        attachment_ids=[], created_at=now, updated_at=now, sync_status="local",
    ))
    # Auto-advance appointment to ready_for_pharmacy if it was in_progress
    if body.appointment_id:
        appt_row = await database.fetch_one(
            appointments_t.select().where(appointments_t.c.id == body.appointment_id)
        )
        if appt_row and dict(appt_row)["status"] == "in_progress":
            await database.execute(
                appointments_t.update().where(appointments_t.c.id == body.appointment_id)
                .values(status="completed", updated_at=now)
            )
            broadcast({"type":"appointment.updated","appointment_id":body.appointment_id,
                       "changes":{"status":"completed"}})
    await audit_log(u["id"], u["role"], "WRITE_RECORD", "medical_records", rec_id,
                    ip=request.client.host if request and request.client else "")
    rec = dict(await database.fetch_one(records_t.select().where(records_t.c.id == rec_id)))
    await enqueue_sync("medical_records", rec_id, "INSERT", rec)
    return rec

@api.get("/records/patient/{patient_id}")
async def patient_records(patient_id: str, u=Depends(current_user), request: Request = None):
    if u["role"] == "patient" and u["id"] != patient_id:
        raise HTTPException(403, "Forbidden")
    rows = await database.fetch_all(
        records_t.select().where(records_t.c.patient_id == patient_id)
        .order_by(records_t.c.created_at.desc())
    )
    await audit_log(u["id"], u["role"], "READ_RECORD", "medical_records", patient_id,
                    ip=request.client.host if request and request.client else "")
    result = []
    for r in rows:
        rec = dict(r)
        doc = await database.fetch_one(users_t.select().where(users_t.c.id == rec["doctor_id"]))
        rec["doctor"] = clean(dict(doc)) if doc else None
        result.append(rec)
    return result

# ── AI Triage — Manchester Triage System (MTS) ────────────────────────────────
MTS_SYSTEM = """You are MediLink's clinical AI running the Manchester Triage System (MTS) used in Malaysian hospitals.

Assess the patient and output ONLY a JSON object with exactly these fields:
{
  "category": "Immediate" | "Very Urgent" | "Urgent" | "Standard" | "Non-Urgent",
  "colour": "Red" | "Orange" | "Yellow" | "Green" | "Blue",
  "target_wait_minutes": <integer: 0, 10, 60, 120, or 240>,
  "clinical_score": <integer 1-5, where 5=most critical>,
  "reasoning": "<2-3 sentences explaining the clinical rationale>",
  "red_flags": ["<flag>", ...],
  "recommended_action": "<specific immediate action for staff>",
  "vital_concerns": ["<concern>", ...],
  "reassess_in_minutes": <integer, when to reassess if condition unchanged>
}

MTS Categories (use strict clinical criteria):
- Immediate (Red, 0 min): Airway compromise, absent/inadequate breathing, shock, unconscious, uncontrolled major haemorrhage, ongoing seizure, acute MI signs
- Very Urgent (Orange, 10 min): Severe pain (7-10/10), abnormal vitals (HR<40 or >140, SpO2<90%, temp>41°C or <35°C, BP<80 systolic), hot or cold periphery, acute confusion, vomiting blood, severe respiratory distress, stroke signs (FAST+)
- Urgent (Yellow, 60 min): Moderate pain (4-7/10), moderate distress, moderate abnormal vitals, pleuritic chest pain, moderate respiratory difficulty, head injury without LOC
- Standard (Green, 120 min): Mild pain (1-3/10), minor injury, chronic complaint, non-urgent presentation, normal vitals
- Non-Urgent (Blue, 240 min): No pain or pain 0/10, administrative, repeat prescription, minor chronic issue

Always err toward higher urgency when uncertain. Missing vitals does not lower urgency."""

@api.post("/ai/triage")
async def ai_triage(body: TriageIn, u=Depends(role_required("doctor","admin","receptionist"))):
    # Build comprehensive clinical prompt
    vitals_parts = []
    if body.vitals:
        v = body.vitals
        if v.bp: vitals_parts.append(f"BP: {v.bp} mmHg")
        if v.hr: vitals_parts.append(f"HR: {v.hr} bpm {'⚠️ TACHYCARDIA' if v.hr > 100 else '⚠️ BRADYCARDIA' if v.hr < 60 else ''}")
        if v.temp: vitals_parts.append(f"Temp: {v.temp}°C {'⚠️ FEVER' if v.temp > 37.5 else '⚠️ HYPOTHERMIA' if v.temp < 36 else ''}")
        if v.spo2: vitals_parts.append(f"SpO2: {v.spo2}% {'⚠️ HYPOXIA' if v.spo2 < 94 else ''}")
        if v.rr: vitals_parts.append(f"RR: {v.rr} breaths/min {'⚠️ TACHYPNOEA' if v.rr > 20 else ''}")
        if v.weight: vitals_parts.append(f"Weight: {v.weight} kg")

    # Fetch patient context if available
    patient_context = ""
    if body.patient_id:
        p = await database.fetch_one(users_t.select().where(users_t.c.id == body.patient_id))
        if p:
            pd = dict(p)
            patient_context = f"Age: {body.age or pd.get('dob', 'Unknown')}, Gender: {body.gender or pd.get('gender','Unknown')}"

    prompt = f"""PATIENT: {patient_context or f'Age: {body.age or "Unknown"}, Gender: {body.gender or "Unknown"}'}
CHIEF COMPLAINT: {body.chief_complaint}
PAIN SCORE: {body.pain_score if body.pain_score is not None else "Not assessed"}/10
DURATION: {body.duration or "Not specified"}
VITAL SIGNS: {" | ".join(vitals_parts) if vitals_parts else "Not recorded"}
KNOWN CONDITIONS: {body.known_conditions or "None stated"}
ALLERGIES: {body.allergies or "None stated"}
HISTORY: {body.history or "None provided"}

Apply MTS strictly. Output JSON only."""

    raw = await groq(MTS_SYSTEM, [{"role":"user","content":prompt}],
                     max_tokens=600, temperature=0.1, response_format="json")
    try:
        result = json.loads(raw.strip().lstrip("```json").rstrip("```").strip())
    except Exception:
        result = {"raw":raw,"parse_error":True,"category":"Urgent","colour":"Yellow",
                  "target_wait_minutes":60,"reasoning":"Parse error — review manually"}
    return result

@api.post("/ai/symptom-check")
async def ai_symptom_check(body: AISymptomIn, u=Depends(current_user)):
    system = (
        "You are MediLink's patient-facing health assistant for a Malaysian clinic. "
        "You help patients understand symptoms and urgency. "
        f"{'Patient context: ' + body.patient_context if body.patient_context else ''} "
        "Ask ONE clarifying question at a time. Identify possible causes (non-diagnostic). "
        "Rate urgency: Self-care / See doctor within a week / See doctor today / Go to ER now. "
        "Be warm, clear, and multilingual-friendly (patient may mix English and Bahasa Malaysia). "
        "End every response with: '⚠️ Ini bukan nasihat perubatan. Sila berjumpa doktor.' "
        "Max 120 words. Plain text only."
    )
    messages = body.history + [{"role":"user","content":body.message}]
    return StreamingResponse(
        groq_stream(system, messages),
        media_type="text/event-stream",
        headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"},
    )

@api.post("/ai/summary")
async def ai_summary(body: AISummaryIn, u=Depends(role_required("doctor","admin"))):
    p = await database.fetch_one(users_t.select().where(users_t.c.id == body.patient_id))
    if not p: raise HTTPException(404, "Patient not found")
    rows = await database.fetch_all(
        records_t.select().where(records_t.c.patient_id == body.patient_id)
        .order_by(records_t.c.created_at.desc()).limit(20)
    )
    if not rows: return {"summary":"No prior medical records found for this patient."}
    history_text = "\n\n".join([
        f"Visit {i+1} | {dict(r).get('created_at','')[:10]} | Facility: {dict(r).get('facility_id','-')}\n"
        f"  Triage: {dict(r).get('triage_category','-')} ({dict(r).get('triage_colour','-')})\n"
        f"  Diagnosis: {dict(r).get('diagnosis','-')}\n"
        f"  Notes: {dict(r).get('notes','-')}\n"
        f"  Allergies: {dict(r).get('allergies','-')}\n"
        f"  Prescriptions: {', '.join([m['medicine'] for m in (dict(r).get('prescriptions') or [])]) or '-'}"
        for i, r in enumerate(rows)
    ])
    pd = dict(p)
    prompt = f"Patient: {pd['name']} | DOB: {pd.get('dob','-')} | Gender: {pd.get('gender','-')} | IC: {pd.get('ic_number','-')}\n\n{history_text}"
    system = (
        "You are a clinical summarization AI for a doctor. Produce a concise structured summary. "
        "Use these exact headings: CHRONIC CONDITIONS | RECURRING SYMPTOMS | ACTIVE MEDICATIONS | "
        "ALLERGIES | RED FLAGS | RECENT VISITS. Bullet points only. Max 200 words. "
        "Flag any dangerous patterns. Be precise and clinical."
    )
    summary = await groq(system, [{"role":"user","content":prompt}], max_tokens=300)
    return {"summary":summary,"patient":clean(pd),"record_count":len(rows)}

@api.post("/ai/drug-check")
async def ai_drug_check(body: AIDrugCheckIn, u=Depends(role_required("doctor","admin"))):
    if not body.medicines: raise HTTPException(400, "Provide at least 1 medicine")
    context = ""
    if body.patient_age: context += f" Patient age: {body.patient_age}."
    if body.known_conditions: context += f" Known conditions: {body.known_conditions}."
    system = (
        "You are a clinical pharmacology safety AI.{context} "
        "Analyse the given medicines and output: "
        "1. DRUG INTERACTIONS (list each pair, severity: Minor/Moderate/Major/Contraindicated, clinical effect) "
        "2. CONTRAINDICATIONS (if patient context given) "
        "3. MONITORING REQUIREMENTS "
        "4. SAFE TO PRESCRIBE TOGETHER? (Yes/No/With caution) "
        "Be concise. End with: '⚠️ Clinical judgement required. This is a screening tool only.'"
    ).replace("{context}", context)
    result = await groq(system, [{"role":"user","content":"Medicines: " + ", ".join(body.medicines)}],
                        max_tokens=400)
    return {"analysis":result,"medicines":body.medicines}

# ── Availability & slots ──────────────────────────────────────────────────────
@api.get("/availability/{doctor_id}")
async def get_availability(doctor_id: str):
    d = await database.fetch_one(
        users_t.select().where((users_t.c.id == doctor_id) & (users_t.c.role == "doctor"))
    )
    if not d: raise HTTPException(404, "Doctor not found")
    return {"doctor_id":doctor_id,"hours":dict(d)["availability"] or DEFAULT_AVAIL,
            "slot_minutes":dict(d).get("slot_minutes",30)}

@api.patch("/availability/me")
async def update_availability(body: AvailabilityIn, u=Depends(role_required("doctor"))):
    await database.execute(users_t.update().where(users_t.c.id == u["id"])
        .values(availability=body.hours, slot_minutes=body.slot_minutes, updated_at=now_iso()))
    return {"hours":body.hours,"slot_minutes":body.slot_minutes}

@api.get("/availability/{doctor_id}/slots")
async def get_slots(doctor_id: str, date: str = Query(...)):
    d = await database.fetch_one(
        users_t.select().where((users_t.c.id == doctor_id) & (users_t.c.role == "doctor"))
    )
    if not d: raise HTTPException(404, "Doctor not found")
    doc = dict(d)
    try: the_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError: raise HTTPException(400, "date must be YYYY-MM-DD")
    dow = ["mon","tue","wed","thu","fri","sat","sun"][the_date.weekday()]
    window = (doc.get("availability") or DEFAULT_AVAIL).get(dow, "")
    if not window or "-" not in window:
        return {"date":date,"doctor_id":doctor_id,"slots":[],"off":True}
    try:
        a, b = window.split("-")
        sh, sm = map(int, a.split(":")); eh, em = map(int, b.split(":"))
        start_min, end_min = sh*60+sm, eh*60+em
    except: return {"date":date,"doctor_id":doctor_id,"slots":[],"off":True}
    slot_min = int(doc.get("slot_minutes") or 30)
    booked_rows = await database.fetch_all(
        appointments_t.select().where(
            (appointments_t.c.doctor_id == doctor_id) &
            (appointments_t.c.scheduled_at.like(f"{date}%")) &
            (appointments_t.c.status != "cancelled")
        )
    )
    booked = set()
    for r in booked_rows:
        try:
            t = datetime.fromisoformat(dict(r)["scheduled_at"].replace("Z","+00:00"))
            booked.add(t.hour*60+t.minute)
        except: pass
    slots = []
    cur = start_min
    while cur + slot_min <= end_min:
        hh, mm = divmod(cur, 60)
        slots.append({"time":f"{hh:02d}:{mm:02d}",
                      "iso":the_date.replace(hour=hh,minute=mm).isoformat(),
                      "booked":cur in booked})
        cur += slot_min
    return {"date":date,"doctor_id":doctor_id,"slots":slots,"off":False}

# ── Pharmacy inventory ────────────────────────────────────────────────────────
@api.get("/inventory")
async def list_inventory(u=Depends(role_required("pharmacist","admin","doctor"))):
    rows = await database.fetch_all(
        inventory_t.select().where(inventory_t.c.active == True)
        .order_by(inventory_t.c.name)
    )
    return [dict(r) for r in rows]

@api.post("/inventory", status_code=201)
async def add_inventory(body: InventoryItemIn, u=Depends(role_required("pharmacist","admin"))):
    item_id = uid(); now = now_iso()
    await database.execute(inventory_t.insert().values(
        id=item_id, name=body.name, generic_name=body.generic_name,
        category=body.category, unit=body.unit, stock_qty=body.stock_qty,
        reorder_level=body.reorder_level, unit_price=body.unit_price,
        expiry_date=body.expiry_date, batch_no=body.batch_no, supplier=body.supplier,
        active=True, facility_id=FACILITY_ID,
        created_at=now, updated_at=now, sync_status="local",
    ))
    return dict(await database.fetch_one(inventory_t.select().where(inventory_t.c.id == item_id)))

@api.patch("/inventory/{item_id}")
async def update_inventory(item_id: str, body: InventoryUpdateIn,
                           u=Depends(role_required("pharmacist","admin"))):
    updates = {k:v for k,v in body.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    await database.execute(inventory_t.update().where(inventory_t.c.id == item_id).values(**updates))
    row = await database.fetch_one(inventory_t.select().where(inventory_t.c.id == item_id))
    if not row: raise HTTPException(404, "Item not found")
    return dict(row)

@api.get("/inventory/low-stock")
async def low_stock_alerts(u=Depends(role_required("pharmacist","admin"))):
    rows = await database.fetch_all(inventory_t.select().where(inventory_t.c.active == True))
    alerts = []
    for r in rows:
        item = dict(r)
        if item["stock_qty"] <= item["reorder_level"]:
            alerts.append({**item,"alert_type":"low_stock"})
        if item.get("expiry_date"):
            try:
                days = (datetime.strptime(item["expiry_date"],"%Y-%m-%d") - datetime.now()).days
                if days <= 30:
                    alerts.append({**item,"alert_type":"expiring_soon","days_left":days})
            except: pass
    return sorted(alerts, key=lambda x: x.get("days_left",9999))

@api.get("/pharmacy/queue")
async def pharmacy_queue(u=Depends(role_required("pharmacist","admin"))):
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
async def dispense(body: DispenseIn, u=Depends(role_required("pharmacist","admin"))):
    appt = await database.fetch_one(
        appointments_t.select().where(appointments_t.c.id == body.appointment_id)
    )
    if not appt or dict(appt)["status"] != "ready_for_pharmacy":
        raise HTTPException(400, "Appointment not ready for pharmacy")
    total = 0.0
    for item in body.items:
        inv_id = item.get("inventory_id")
        qty = int(item.get("qty",1))
        if inv_id:
            inv_row = await database.fetch_one(inventory_t.select().where(inventory_t.c.id == inv_id))
            if inv_row:
                inv = dict(inv_row)
                await database.execute(
                    inventory_t.update().where(inventory_t.c.id == inv_id)
                    .values(stock_qty=max(0, inv["stock_qty"] - qty), updated_at=now_iso())
                )
                total += inv["unit_price"] * qty
    disp_id = uid(); now = now_iso()
    await database.execute(dispense_t.insert().values(
        id=disp_id, appointment_id=body.appointment_id,
        patient_id=body.patient_id, pharmacist_id=u["id"],
        items=body.items, total_cost=total,
        dispensed_at=now, facility_id=FACILITY_ID, sync_status="local",
    ))
    await database.execute(
        appointments_t.update().where(appointments_t.c.id == body.appointment_id)
        .values(status="dispensed", dispensed_at=now, dispensed_by=u["id"], updated_at=now)
    )
    broadcast({"type":"appointment.updated","appointment_id":body.appointment_id,
               "changes":{"status":"dispensed"}})
    return {"ok":True,"dispense_id":disp_id,"total_cost":total}

# ── Hybrid sync ────────────────────────────────────────────────────────────────
@api.get("/sync/status")
async def sync_status(u=Depends(current_user)):
    total   = await database.fetch_val(text("SELECT COUNT(*) FROM medical_records")) or 0
    local   = await database.fetch_val(text("SELECT COUNT(*) FROM medical_records WHERE sync_status='local'")) or 0
    synced  = await database.fetch_val(text("SELECT COUNT(*) FROM medical_records WHERE sync_status='cloud'")) or 0
    pending = await database.fetch_val(text("SELECT COUNT(*) FROM sync_queue WHERE synced=false")) or 0
    errors  = await database.fetch_val(text("SELECT COUNT(*) FROM sync_queue WHERE synced=false AND attempts>=3")) or 0
    last_row = await database.fetch_one(
        records_t.select().where(records_t.c.sync_status == "cloud")
        .order_by(records_t.c.synced_at.desc())
    )
    return {
        "node": "cloud" if IS_CLOUD else "local",
        "facility_id": FACILITY_ID,
        "total_records": total,
        "synced_to_cloud": synced,
        "local_only": local,
        "pending_sync": pending,
        "sync_errors": errors,
        "last_synced": dict(last_row).get("synced_at") if last_row else None,
        "cloud_connected": cloud_db is not None,
        "hardware": "HP Folio 9470m (local)" if not IS_CLOUD else "Cloud Node",
    }

@api.post("/sync/trigger")
async def trigger_sync(bg: BackgroundTasks, u=Depends(role_required("admin"))):
    bg.add_task(run_sync_job)
    return {"ok":True,"message":"Sync job triggered"}

@api.get("/sync/queue")
async def view_sync_queue(limit: int = Query(50, le=200), u=Depends(role_required("admin"))):
    rows = await database.fetch_all(
        sync_queue_t.select()
        .where(sync_queue_t.c.synced == False)
        .order_by(sync_queue_t.c.created_at.desc())
        .limit(limit)
    )
    return [dict(r) for r in rows]

# ── Audit logs ────────────────────────────────────────────────────────────────
@api.get("/audit/logs")
async def audit_logs(limit: int = Query(100, le=500), u=Depends(role_required("admin"))):
    rows = await database.fetch_all(
        audit_t.select().order_by(audit_t.c.timestamp.desc()).limit(limit)
    )
    return [dict(r) for r in rows]

# ── Admin stats ───────────────────────────────────────────────────────────────
@api.get("/admin/stats")
async def admin_stats(u=Depends(role_required("admin"))):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return {
        "patients": await database.fetch_val(text("SELECT COUNT(*) FROM users WHERE role='patient'")) or 0,
        "doctors":  await database.fetch_val(text("SELECT COUNT(*) FROM users WHERE role='doctor'")) or 0,
        "today_appointments": await database.fetch_val(
            text(f"SELECT COUNT(*) FROM appointments WHERE scheduled_at LIKE '{today}%'")) or 0,
        "today_completed": await database.fetch_val(
            text(f"SELECT COUNT(*) FROM appointments WHERE scheduled_at LIKE '{today}%' AND status='dispensed'")) or 0,
        "inventory_alerts": await database.fetch_val(
            text("SELECT COUNT(*) FROM pharmacy_inventory WHERE stock_qty <= reorder_level AND active=true")) or 0,
        "pending_sync": await database.fetch_val(text("SELECT COUNT(*) FROM sync_queue WHERE synced=false")) or 0,
    }

# ── Seed ──────────────────────────────────────────────────────────────────────
@api.post("/seed")
async def seed():
    if not ALLOW_SEED:
        raise HTTPException(403, "Seeding disabled. Set ALLOW_SEED=true (dev/demo only).")
    seeded, skipped = [], []
    demo_users = [
        {"email":"dr.tan@medilink.io","password":"Doctor@123","name":"Dr. Wei Tan","role":"doctor","specialty":"General Physician","license_no":"MMC-44219"},
        {"email":"pharmacy@medilink.io","password":"Pharm@123","name":"Pn. Lily Lim","role":"pharmacist"},
        {"email":"reception@medilink.io","password":"Recep@123","name":"Sarah Ang","role":"receptionist"},
    ]
    # System administrator comes from env — never hardcoded credentials
    if os.environ.get("ADMIN_EMAIL") and os.environ.get("ADMIN_PASSWORD"):
        demo_users.insert(0, {
            "email": os.environ["ADMIN_EMAIL"],
            "password": os.environ["ADMIN_PASSWORD"],
            "name": os.environ.get("ADMIN_NAME", "System Administrator"),
            "role": "admin",
            "ic_number": os.environ.get("ADMIN_IC") or None,
            "phone": os.environ.get("ADMIN_PHONE") or None,
            "dob": os.environ.get("ADMIN_DOB") or None,
            "gender": os.environ.get("ADMIN_GENDER") or None,
        })
    for u in demo_users:
        if await database.fetch_one(users_t.select().where(users_t.c.email == u["email"])):
            skipped.append(u["email"]); continue
        uid_ = uid(); now = now_iso()
        await database.execute(users_t.insert().values(
            id=uid_, email=u["email"], password_hash=hash_pw(u["password"]),
            name=u["name"], role=u["role"],
            ic_number=u.get("ic_number"), phone=u.get("phone"),
            dob=u.get("dob"), gender=u.get("gender"),
            specialty=u.get("specialty"), license_no=u.get("license_no"),
            availability=DEFAULT_AVAIL if u["role"]=="doctor" else None,
            slot_minutes=30, facility_id=FACILITY_ID, source="seed",
            created_at=now, updated_at=now, sync_status="local",
        ))
        seeded.append(u["email"])
    demo_meds = [
        {"name":"Paracetamol 500mg","generic_name":"Acetaminophen","category":"Analgesic","unit":"tablet","stock_qty":500,"reorder_level":100,"unit_price":0.20},
        {"name":"Amoxicillin 250mg","generic_name":"Amoxicillin","category":"Antibiotic","unit":"capsule","stock_qty":200,"reorder_level":50,"unit_price":0.80},
        {"name":"Cetirizine 10mg","generic_name":"Cetirizine","category":"Antihistamine","unit":"tablet","stock_qty":300,"reorder_level":60,"unit_price":0.35},
        {"name":"Metformin 500mg","generic_name":"Metformin HCl","category":"Antidiabetic","unit":"tablet","stock_qty":400,"reorder_level":80,"unit_price":0.45},
        {"name":"Amlodipine 5mg","generic_name":"Amlodipine Besylate","category":"Antihypertensive","unit":"tablet","stock_qty":350,"reorder_level":70,"unit_price":0.55},
        {"name":"Omeprazole 20mg","generic_name":"Omeprazole","category":"PPI","unit":"capsule","stock_qty":250,"reorder_level":50,"unit_price":0.60},
        {"name":"Salbutamol Inhaler","generic_name":"Salbutamol","category":"Bronchodilator","unit":"unit","stock_qty":40,"reorder_level":10,"unit_price":12.50},
        {"name":"ORS Sachet","generic_name":"Oral Rehydration Salts","category":"Rehydration","unit":"sachet","stock_qty":150,"reorder_level":30,"unit_price":0.80},
        {"name":"Ibuprofen 400mg","generic_name":"Ibuprofen","category":"NSAID","unit":"tablet","stock_qty":8,"reorder_level":80,"unit_price":0.30},
        {"name":"Azithromycin 250mg","generic_name":"Azithromycin","category":"Antibiotic","unit":"tablet","stock_qty":100,"reorder_level":40,"unit_price":2.20},
        {"name":"Dexamethasone 0.5mg","generic_name":"Dexamethasone","category":"Corticosteroid","unit":"tablet","stock_qty":180,"reorder_level":40,"unit_price":0.15},
        {"name":"Atorvastatin 20mg","generic_name":"Atorvastatin","category":"Lipid-lowering","unit":"tablet","stock_qty":320,"reorder_level":60,"unit_price":0.90},
    ]
    for med in demo_meds:
        if not await database.fetch_one(inventory_t.select().where(inventory_t.c.name == med["name"])):
            now = now_iso()
            await database.execute(inventory_t.insert().values(
                id=uid(), active=True, facility_id=FACILITY_ID,
                created_at=now, updated_at=now, sync_status="local", **med
            ))
    return {"seeded":seeded,"skipped":skipped}

# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/api/ws/queue")
async def ws_queue(ws: WebSocket, token: str = Query(...)):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        await ws.close(code=1008); return
    user = await database.fetch_one(users_t.select().where(users_t.c.id == payload["sub"]))
    if not user:
        await ws.close(code=1008); return
    await ws_mgr.connect(ws)
    try:
        await ws.send_json({"type":"hello","role":dict(user)["role"],"facility":FACILITY_ID})
        while True:
            msg = await ws.receive_text()
            if msg == "ping": await ws.send_json({"type":"pong","ts":now_iso()})
    except WebSocketDisconnect: ws_mgr.disconnect(ws)
    except Exception: ws_mgr.disconnect(ws)

# ── Background sync engine ────────────────────────────────────────────────────
async def run_sync_job():
    """Push local-only records to cloud DB."""
    if not cloud_db or IS_CLOUD:
        return
    try:
        pending = await database.fetch_all(
            sync_queue_t.select()
            .where((sync_queue_t.c.synced == False) & (sync_queue_t.c.attempts < 5))
            .order_by(sync_queue_t.c.created_at)
            .limit(50)
        )
        if not pending:
            return
        log.info(f"Sync: processing {len(pending)} pending records")
        for item in pending:
            item_d = dict(item)
            try:
                tbl_map = {
                    "users": users_t, "appointments": appointments_t,
                    "medical_records": records_t, "payments": payments_t,
                    "dispense_records": dispense_t,
                }
                tbl = tbl_map.get(item_d["table_name"])
                if tbl is None:
                    # Dead-letter: never mark fake-synced; park it out of the retry
                    # window so it stays visible in /sync/queue as an error.
                    await database.execute(
                        sync_queue_t.update().where(sync_queue_t.c.id == item_d["id"])
                        .values(attempts=999, error="Unknown table — dead-lettered")
                    )
                    continue
                payload = item_d["payload"]
                now = now_iso()
                # Upsert to cloud
                existing = await cloud_db.fetch_one(
                    tbl.select().where(tbl.c.id == item_d["record_id"])
                )
                if existing:
                    await cloud_db.execute(
                        tbl.update().where(tbl.c.id == item_d["record_id"])
                        .values(**{k: v for k, v in payload.items() if k != "id"})
                    )
                else:
                    await cloud_db.execute(tbl.insert().values(**payload))
                # Mark synced locally
                await database.execute(
                    tbl.update().where(tbl.c.id == item_d["record_id"])
                    .values(sync_status="cloud", synced_at=now)
                )
                await database.execute(
                    sync_queue_t.update().where(sync_queue_t.c.id == item_d["id"])
                    .values(synced=True, attempted_at=now)
                )
                log.info(f"Synced {item_d['table_name']}:{item_d['record_id']}")
            except Exception as e:
                await database.execute(
                    sync_queue_t.update().where(sync_queue_t.c.id == item_d["id"])
                    .values(attempts=item_d["attempts"]+1, attempted_at=now_iso(), error=str(e)[:500])
                )
                log.warning(f"Sync failed for {item_d['record_id']}: {e}")
    except Exception as e:
        log.exception(f"Sync job error: {e}")

# ── Startup / shutdown ────────────────────────────────────────────────────────
app.include_router(api)
_cors = [o.strip() for o in os.environ.get(
    "CORS_ORIGINS", "http://localhost:3000,http://localhost:8000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors,
    # Local-first clinic server: also accept devices on the private LAN
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def security_headers(request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp

@app.on_event("startup")
async def startup():
    await database.connect()
    if cloud_db:
        try:
            await cloud_db.connect()
            log.info("Cloud DB connected")
        except Exception as e:
            log.warning(f"Cloud DB connection failed (offline mode): {e}")
    # Create tables
    sync_db_url = DATABASE_URL
    if "postgresql://" in sync_db_url:
        sync_db_url = sync_db_url.replace("postgresql://","postgresql+psycopg2://")
    engine = create_engine(sync_db_url)
    metadata.create_all(engine); engine.dispose()
    log.info(f"Tables ready | Facility: {FACILITY_ID} | Node: {'cloud' if IS_CLOUD else 'local'}")
    # Auto seed
    count = await database.fetch_val(text("SELECT COUNT(*) FROM users"))
    if not count:
        if ALLOW_SEED:
            await seed(); log.info("Demo data seeded")
        else:
            log.warning("users table empty and ALLOW_SEED=false — create an admin via /api/auth/register or enable ALLOW_SEED once")
    # Start background sync loop
    if not IS_CLOUD and cloud_db:
        asyncio.create_task(sync_loop())

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()
    if cloud_db:
        try: await cloud_db.disconnect()
        except: pass

async def sync_loop():
    """Background loop — syncs every SYNC_INTERVAL seconds."""
    while True:
        await asyncio.sleep(SYNC_INTERVAL)
        await run_sync_job()
