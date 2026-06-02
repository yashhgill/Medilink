"""MediLink PHR iteration 3 backend tests — Kiosk (lookup/checkin/pay) +
Pharmacy (queue/dispense) + AppointmentUpdate enum + pharmacist auth.

Full E2E flow:
  kiosk-checkin → doctor-record (with prescriptions) → kiosk-pay
  → pharmacy/queue contains row → pharmacy/dispense → status=dispensed
"""
import os
import uuid
import requests
import pytest
from datetime import datetime, timezone

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

PATIENT_IC = "IC-880421-14-5567"  # patient1
UNKNOWN_IC = "IC-000000-00-0000"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # ensure seed
    s.post(f"{API}/seed", timeout=30)
    return s


def _login(session, email, pw):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return r.json()


def _hdr(auth):
    return {"Authorization": f"Bearer {auth['token']}"}


@pytest.fixture(scope="module")
def admin_auth(session):
    return _login(session, "admin@medilink.io", "Admin@123")


@pytest.fixture(scope="module")
def doctor_auth(session):
    return _login(session, "dr.tan@medilink.io", "Doctor@123")


@pytest.fixture(scope="module")
def pharmacy_auth(session):
    return _login(session, "pharmacy@medilink.io", "Pharm@123")


@pytest.fixture(scope="module")
def patient_auth(session):
    return _login(session, "patient1@medilink.io", "Patient@123")


# ---------- Auth / Seed ----------
class TestSeedAndAuth:
    def test_pharmacist_login(self, pharmacy_auth):
        assert pharmacy_auth["user"]["role"] == "pharmacist"
        assert pharmacy_auth["user"]["email"] == "pharmacy@medilink.io"
        assert isinstance(pharmacy_auth["token"], str) and len(pharmacy_auth["token"]) > 0

    def test_existing_demo_accounts_unchanged(self, admin_auth, doctor_auth, patient_auth):
        assert admin_auth["user"]["role"] == "admin"
        assert doctor_auth["user"]["role"] == "doctor"
        assert patient_auth["user"]["role"] == "patient"


# ---------- Kiosk lookup ----------
class TestKioskLookup:
    def test_lookup_known_ic_public(self, session):
        # no auth headers — must be public
        s = requests.Session()
        r = s.get(f"{API}/kiosk/lookup/{PATIENT_IC}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "patient" in data and data["patient"]["ic_number"] == PATIENT_IC
        assert "today_appointments" in data
        assert isinstance(data["today_appointments"], list)
        # no _id leaks
        assert "_id" not in data["patient"]

    def test_lookup_unknown_ic_returns_404(self):
        r = requests.get(f"{API}/kiosk/lookup/{UNKNOWN_IC}", timeout=30)
        assert r.status_code == 404


# ---------- Kiosk check-in ----------
class TestKioskCheckin:
    def test_checkin_unknown_ic_404(self):
        r = requests.post(
            f"{API}/kiosk/checkin",
            json={"ic_number": UNKNOWN_IC},
            timeout=30,
        )
        assert r.status_code == 404

    def test_checkin_creates_walkin_or_marks_existing(self, session, patient_auth):
        # public endpoint
        r = requests.post(
            f"{API}/kiosk/checkin",
            json={"ic_number": PATIENT_IC, "reason": "TEST_walkin"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "appointment" in data
        assert "patient" in data
        assert "doctor" in data
        assert "chit" in data
        chit = data["chit"]
        assert chit["type"] == "QUEUE"
        assert chit["patient_ic"] == PATIENT_IC
        assert "queue_number" in chit and isinstance(chit["queue_number"], int)
        assert chit["doctor_name"]
        appt = data["appointment"]
        assert appt["status"] == "checked_in"
        # walk-in created_by kiosk OR existing scheduled appt got updated — both acceptable
        # store id for downstream tests via module-level dict
        pytest._appt_id = appt["id"]
        pytest._appt_source = appt.get("source", "")

    def test_checkin_idempotency_same_appointment(self):
        """Second call same day should NOT create a new appt — should return same checked_in appt."""
        r = requests.post(
            f"{API}/kiosk/checkin",
            json={"ic_number": PATIENT_IC},
            timeout=30,
        )
        assert r.status_code == 200
        appt2 = r.json()["appointment"]
        assert appt2["status"] == "checked_in"
        # same id as first call (existing path)
        assert appt2["id"] == pytest._appt_id


# ---------- Doctor creates medical record with prescriptions ----------
class TestDoctorRecordWithPrescriptions:
    def test_doctor_creates_record_with_prescriptions(self, session, doctor_auth, patient_auth):
        """Required for kiosk/pay medicine_chit to have prescriptions."""
        appt_id = pytest._appt_id
        patient_id = patient_auth["user"]["id"]
        body = {
            "patient_id": patient_id,
            "appointment_id": appt_id,
            "diagnosis": "TEST_Iter3 — viral fever",
            "notes": "TEST_notes",
            "prescriptions": [
                {"medicine": "Paracetamol 500mg", "dosage": "1 tab", "frequency": "TDS", "duration": "3 days"},
                {"medicine": "Vitamin C 500mg", "dosage": "1 tab", "frequency": "OD", "duration": "5 days"},
            ],
            "vitals": {"bp": "120/80", "pulse": 78, "temp": 38.1},
        }
        r = requests.post(
            f"{API}/records", json=body, headers=_hdr(doctor_auth), timeout=30
        )
        assert r.status_code in (200, 201), r.text
        rec = r.json()
        assert rec["diagnosis"].startswith("TEST_Iter3")
        assert len(rec["prescriptions"]) == 2


# ---------- Kiosk pay ----------
class TestKioskPay:
    def test_pay_unknown_ic_404(self):
        r = requests.post(
            f"{API}/kiosk/pay",
            json={
                "ic_number": UNKNOWN_IC,
                "appointment_id": pytest._appt_id,
                "method": "card",
            },
            timeout=30,
        )
        assert r.status_code == 404

    def test_pay_wrong_patient_404(self):
        # IC-950311-08-2210 belongs to patient2 — doesn't own _appt_id
        r = requests.post(
            f"{API}/kiosk/pay",
            json={
                "ic_number": "IC-950311-08-2210",
                "appointment_id": pytest._appt_id,
                "method": "card",
            },
            timeout=30,
        )
        assert r.status_code == 404

    def test_pay_success(self):
        r = requests.post(
            f"{API}/kiosk/pay",
            json={
                "ic_number": PATIENT_IC,
                "appointment_id": pytest._appt_id,
                "method": "wallet",
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "payment" in data and "receipt" in data and "medicine_chit" in data
        assert data["payment"]["status"] == "succeeded"
        assert data["payment"]["method"] == "wallet"
        assert data["receipt"]["type"] == "RECEIPT"
        chit = data["medicine_chit"]
        assert chit["type"] == "MEDICINE"
        # prescriptions pulled from latest record
        assert isinstance(chit["prescriptions"], list)
        assert len(chit["prescriptions"]) == 2
        names = [p.get("medicine") for p in chit["prescriptions"]]
        assert "Paracetamol 500mg" in names
        # appointment status flipped in DB (return payload may be stale — minor)
        # DB state will be verified by pharmacy/queue presence in TestPharmacy

    def test_pay_double_pay_400(self):
        r = requests.post(
            f"{API}/kiosk/pay",
            json={
                "ic_number": PATIENT_IC,
                "appointment_id": pytest._appt_id,
                "method": "card",
            },
            timeout=30,
        )
        assert r.status_code == 400


# ---------- Pharmacy queue + dispense ----------
class TestPharmacy:
    def test_pharmacy_queue_requires_role(self, patient_auth, doctor_auth):
        r = requests.get(f"{API}/pharmacy/queue", headers=_hdr(patient_auth), timeout=30)
        assert r.status_code == 403
        r2 = requests.get(f"{API}/pharmacy/queue", headers=_hdr(doctor_auth), timeout=30)
        assert r2.status_code == 403

    def test_pharmacy_queue_contains_paid_appt(self, pharmacy_auth):
        r = requests.get(f"{API}/pharmacy/queue", headers=_hdr(pharmacy_auth), timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        ids = [a["id"] for a in items]
        assert pytest._appt_id in ids, f"paid appt missing from pharmacy queue. ids={ids}"
        row = next(a for a in items if a["id"] == pytest._appt_id)
        assert row["status"] == "ready_for_pharmacy"
        assert row.get("patient") and row["patient"]["ic_number"] == PATIENT_IC
        assert row.get("doctor")
        assert row.get("record") and len(row["record"]["prescriptions"]) == 2

    def test_dispense_wrong_role_403(self, patient_auth):
        r = requests.post(
            f"{API}/pharmacy/dispense/{pytest._appt_id}",
            headers=_hdr(patient_auth), timeout=30,
        )
        assert r.status_code == 403

    def test_dispense_success(self, pharmacy_auth):
        r = requests.post(
            f"{API}/pharmacy/dispense/{pytest._appt_id}",
            headers=_hdr(pharmacy_auth), timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "dispensed"

    def test_dispense_idempotent_or_400(self, pharmacy_auth):
        # already dispensed -> 400
        r = requests.post(
            f"{API}/pharmacy/dispense/{pytest._appt_id}",
            headers=_hdr(pharmacy_auth), timeout=30,
        )
        assert r.status_code == 400


# ---------- AppointmentUpdate enum expansion ----------
class TestAppointmentStatusEnum:
    def test_patch_status_ready_for_pharmacy_and_dispensed(self, admin_auth, doctor_auth, patient_auth):
        # create fresh appt
        from datetime import timedelta
        sched = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        r = requests.post(
            f"{API}/appointments",
            json={
                "patient_id": patient_auth["user"]["id"],
                "doctor_id": doctor_auth["user"]["id"],
                "scheduled_at": sched,
                "reason": "TEST_enum",
                "fee": 50,
            },
            headers=_hdr(patient_auth), timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        appt_id = r.json()["id"]
        # patch -> ready_for_pharmacy
        r2 = requests.patch(
            f"{API}/appointments/{appt_id}",
            json={"status": "ready_for_pharmacy"},
            headers=_hdr(admin_auth), timeout=30,
        )
        assert r2.status_code == 200, r2.text
        # patch -> dispensed
        r3 = requests.patch(
            f"{API}/appointments/{appt_id}",
            json={"status": "dispensed"},
            headers=_hdr(admin_auth), timeout=30,
        )
        assert r3.status_code == 200, r3.text
        # invalid enum
        r4 = requests.patch(
            f"{API}/appointments/{appt_id}",
            json={"status": "bogus_status"},
            headers=_hdr(admin_auth), timeout=30,
        )
        assert r4.status_code in (400, 422)


# ---------- Quick regression — earlier endpoints still alive ----------
class TestRegression:
    def test_health(self):
        # /api/ is the basic root probe
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code in (200, 404)  # router root may not be defined; service alive
        # auth/login is a safer liveness probe
        r2 = requests.post(f"{API}/auth/login", json={"email": "x@y.z", "password": "x"}, timeout=10)
        assert r2.status_code in (400, 401, 422)

    def test_doctors_list(self, patient_auth):
        r = requests.get(f"{API}/doctors", headers=_hdr(patient_auth), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1

    def test_nfc_scan(self, admin_auth):
        r = requests.post(
            f"{API}/nfc/scan",
            json={"ic_number": PATIENT_IC},
            headers=_hdr(admin_auth), timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["patient"]["ic_number"] == PATIENT_IC
