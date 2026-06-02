"""MediLink PHR backend tests."""
import os
import time
import uuid
import requests
import pytest
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://smart-health-hub-26.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, pw):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def patient_auth(session):
    return _login(session, "patient1@medilink.io", "Patient@123")


@pytest.fixture(scope="module")
def doctor_auth(session):
    return _login(session, "dr.tan@medilink.io", "Doctor@123")


@pytest.fixture(scope="module")
def admin_auth(session):
    return _login(session, "admin@medilink.io", "Admin@123")


def _hdr(auth):
    return {"Authorization": f"Bearer {auth['token']}"}


# --- Health ---
def test_health(session):
    r = session.get(f"{API}/", timeout=20)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# --- Seed idempotency ---
def test_seed_idempotent(session):
    r = session.post(f"{API}/seed", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "created" in data and "skipped" in data
    # second call should skip everything (DB already seeded)
    r2 = session.post(f"{API}/seed", timeout=30)
    assert r2.status_code == 200
    assert len(r2.json()["created"]) == 0


# --- Auth ---
def test_seeded_logins_and_me(session, patient_auth, doctor_auth, admin_auth):
    for auth, expected in [(patient_auth, "patient"), (doctor_auth, "doctor"), (admin_auth, "admin")]:
        r = session.get(f"{API}/auth/me", headers=_hdr(auth), timeout=20)
        assert r.status_code == 200
        assert r.json()["role"] == expected


def test_register_new_patient_then_login(session):
    email = f"TEST_{uuid.uuid4().hex[:8]}@medilink.io"
    pw = "TestPass@123"
    r = session.post(f"{API}/auth/register", json={"email": email, "password": pw, "name": "Test User"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["ic_number"], "expected auto-generated IC"
    assert body["user"]["role"] == "patient"
    # login afterwards
    r2 = session.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r2.status_code == 200


# --- NFC ---
def test_nfc_scan_valid(session, doctor_auth):
    r = session.post(f"{API}/nfc/scan", json={"ic_number": "IC-880421-14-5567"}, headers=_hdr(doctor_auth), timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["patient"]["ic_number"] == "IC-880421-14-5567"
    assert isinstance(j["appointments"], list)


def test_nfc_scan_invalid(session, doctor_auth):
    r = session.post(f"{API}/nfc/scan", json={"ic_number": "IC-NOPE-000"}, headers=_hdr(doctor_auth), timeout=30)
    assert r.status_code == 404


# --- Doctors ---
def test_doctors_listed(session):
    r = session.get(f"{API}/doctors", timeout=20)
    assert r.status_code == 200
    assert len(r.json()) >= 2


# --- Appointment + Payment ---
@pytest.fixture(scope="module")
def appt_id(session, patient_auth):
    # find tan doctor id
    rd = session.get(f"{API}/doctors", timeout=20).json()
    doc_id = next(d["id"] for d in rd if "tan" in d["email"])
    scheduled = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    body = {
        "patient_id": patient_auth["user"]["id"],
        "doctor_id": doc_id,
        "scheduled_at": scheduled,
        "reason": "TEST_routine checkup",
        "fee": 50.0,
    }
    r = session.post(f"{API}/appointments", json=body, headers=_hdr(patient_auth), timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["status"] == "scheduled"
    assert j["payment_status"] == "unpaid"
    assert isinstance(j["queue_number"], int)
    return j["id"]


def test_mock_payment(session, patient_auth, appt_id):
    r = session.post(
        f"{API}/payments/mock",
        json={"appointment_id": appt_id, "amount": 50.0, "method": "card"},
        headers=_hdr(patient_auth),
        timeout=30,
    )
    assert r.status_code == 200
    # verify appointment now shows paid
    r2 = session.get(f"{API}/appointments", headers=_hdr(patient_auth), timeout=30)
    assert r2.status_code == 200
    found = next((a for a in r2.json() if a["id"] == appt_id), None)
    assert found and found["payment_status"] == "paid"


# --- Doctor records & sync ---
@pytest.fixture(scope="module")
def record_id(session, doctor_auth, patient_auth, appt_id):
    body = {
        "patient_id": patient_auth["user"]["id"],
        "appointment_id": appt_id,
        "vitals": {"bp": "120/80", "hr": 72, "temp": 36.8, "spo2": 98},
        "diagnosis": "TEST_Mild pharyngitis",
        "notes": "Rest and fluids.",
        "prescriptions": [
            {"medicine": "Paracetamol", "dosage": "500mg", "frequency": "3x/day", "duration": "5 days"}
        ],
    }
    r = session.post(f"{API}/records", json=body, headers=_hdr(doctor_auth), timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["sync_status"] == "local"
    return j["id"]


def test_doctor_lists_only_own_appointments(session, doctor_auth, patient_auth):
    r = session.get(f"{API}/appointments", headers=_hdr(doctor_auth), timeout=30)
    assert r.status_code == 200
    for a in r.json():
        assert a["doctor_id"] == doctor_auth["user"]["id"]


def test_sync_status_increments(session, doctor_auth, record_id):
    # wait for background sync (~4.5s total)
    time.sleep(6)
    r = session.get(f"{API}/sync/status", headers=_hdr(doctor_auth), timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert j["cloud"] >= 1


# --- AI endpoints ---
def test_ai_summary_doctor(session, doctor_auth, patient_auth, record_id):
    r = session.post(
        f"{API}/ai/summary",
        json={"patient_id": patient_auth["user"]["id"]},
        headers=_hdr(doctor_auth),
        timeout=90,
    )
    assert r.status_code == 200, r.text
    s = r.json().get("summary", "")
    assert isinstance(s, str) and len(s.strip()) > 0


def test_ai_drug_check(session, doctor_auth):
    r = session.post(
        f"{API}/ai/drug-check",
        json={"medicines": ["Warfarin", "Aspirin"]},
        headers=_hdr(doctor_auth),
        timeout=90,
    )
    assert r.status_code == 200, r.text
    a = r.json().get("analysis", "")
    assert isinstance(a, str) and len(a.strip()) > 0


def test_ai_symptom_stream(session, patient_auth):
    headers = _hdr(patient_auth)
    headers["Accept"] = "text/event-stream"
    with session.post(
        f"{API}/ai/symptom-check",
        json={"message": "I have a sore throat and mild fever", "history": []},
        headers=headers,
        stream=True,
        timeout=90,
    ) as r:
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")
        chunks = []
        for line in r.iter_lines(decode_unicode=True):
            if line:
                chunks.append(line)
            if any("[DONE]" in c for c in chunks):
                break
        joined = "\n".join(chunks)
        assert "data:" in joined
        assert "[DONE]" in joined


# --- Authorization ---
def test_patient_cannot_list_patients(session, patient_auth):
    r = session.get(f"{API}/patients", headers=_hdr(patient_auth), timeout=20)
    assert r.status_code == 403


def test_patient_cannot_ai_summary(session, patient_auth):
    r = session.post(
        f"{API}/ai/summary",
        json={"patient_id": patient_auth["user"]["id"]},
        headers=_hdr(patient_auth),
        timeout=30,
    )
    assert r.status_code == 403


def test_patient_cannot_create_record(session, patient_auth):
    body = {"patient_id": patient_auth["user"]["id"], "diagnosis": "x"}
    r = session.post(f"{API}/records", json=body, headers=_hdr(patient_auth), timeout=20)
    assert r.status_code == 403
