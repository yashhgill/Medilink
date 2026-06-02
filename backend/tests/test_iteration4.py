"""MediLink PHR iteration 4 backend tests —
walk-in patient self-registration at kiosk +
drag-and-drop scheduler endpoints (PATCH appt + POST /appointments/block).
"""
import os
import uuid
import requests
import pytest
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

PATIENT_IC = "IC-880421-14-5567"  # patient1


def _login(s, email, pw):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return r.json()


def _hdr(auth):
    return {"Authorization": f"Bearer {auth['token']}"}


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    s.post(f"{API}/seed", timeout=30)
    return s


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


@pytest.fixture(scope="module")
def fresh_ic():
    # Unique per test run to keep kiosk-register idempotent
    return f"IC-TEST-{uuid.uuid4().hex[:10].upper()}"


# ---------- Kiosk register ----------
class TestKioskRegister:
    def test_register_unknown_ic_creates_patient_public(self, fresh_ic):
        # PUBLIC endpoint — no auth header
        payload = {"ic_number": fresh_ic, "name": "TEST_Walkin Bob", "phone": "+60-12-9999111"}
        r = requests.post(f"{API}/kiosk/register", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "patient" in data and "email" in data
        p = data["patient"]
        assert p["ic_number"] == fresh_ic
        assert p["name"] == "TEST_Walkin Bob"
        assert p["role"] == "patient"
        assert p["source"] == "kiosk"
        # default email = <ic>@kiosk.medilink.io (lower)
        expected_email = f"{fresh_ic.lower()}@kiosk.medilink.io"
        assert data["email"] == expected_email
        assert p["email"] == expected_email
        # no _id / password_hash leak in response surface (clean())
        assert "_id" not in p

    def test_register_duplicate_ic_400(self, fresh_ic):
        # second call with same IC should 400
        r = requests.post(
            f"{API}/kiosk/register",
            json={"ic_number": fresh_ic, "name": "Duplicate"},
            timeout=30,
        )
        assert r.status_code == 400

    def test_register_duplicate_email_400(self):
        # email collision with existing seeded patient1
        unique_ic = f"IC-DUP-{uuid.uuid4().hex[:6].upper()}"
        r = requests.post(
            f"{API}/kiosk/register",
            json={
                "ic_number": unique_ic,
                "name": "Email Clash",
                "email": "patient1@medilink.io",
            },
            timeout=30,
        )
        assert r.status_code == 400


# ---------- Register + immediate checkin ----------
class TestRegisterThenCheckin:
    def test_register_then_checkin_assigns_queue(self):
        ic = f"IC-FLOW-{uuid.uuid4().hex[:8].upper()}"
        r = requests.post(
            f"{API}/kiosk/register",
            json={"ic_number": ic, "name": "TEST_Flow Walker"},
            timeout=30,
        )
        assert r.status_code == 200, r.text

        # now check-in immediately
        r2 = requests.post(
            f"{API}/kiosk/checkin",
            json={"ic_number": ic, "reason": "TEST_register_then_checkin"},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["appointment"]["status"] == "checked_in"
        assert data["chit"]["type"] == "QUEUE"
        assert isinstance(data["chit"]["queue_number"], int)
        assert data["chit"]["queue_number"] >= 1
        assert data["doctor"] and data["doctor"].get("id")


# ---------- Appointments PATCH expansion ----------
class TestAppointmentPatchExpanded:
    @pytest.fixture(scope="class")
    def appt_id(self, patient_auth, doctor_auth):
        sched = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
        r = requests.post(
            f"{API}/appointments",
            json={
                "patient_id": patient_auth["user"]["id"],
                "doctor_id": doctor_auth["user"]["id"],
                "scheduled_at": sched,
                "reason": "TEST_iter4_patch",
                "fee": 60,
            },
            headers=_hdr(patient_auth), timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def test_patch_scheduled_at(self, admin_auth, appt_id):
        new_time = (datetime.now(timezone.utc) + timedelta(days=1, hours=2)).isoformat()
        r = requests.patch(
            f"{API}/appointments/{appt_id}",
            json={"scheduled_at": new_time},
            headers=_hdr(admin_auth), timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["scheduled_at"] == new_time

    def test_patch_doctor_id(self, admin_auth, doctor_auth, appt_id, session):
        # use the other seeded doctor (kaur)
        kaur = _login(session, "dr.kaur@medilink.io", "Doctor@123")
        new_doc = kaur["user"]["id"]
        r = requests.patch(
            f"{API}/appointments/{appt_id}",
            json={"doctor_id": new_doc},
            headers=_hdr(admin_auth), timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["doctor_id"] == new_doc

    def test_patch_reason(self, admin_auth, appt_id):
        r = requests.patch(
            f"{API}/appointments/{appt_id}",
            json={"reason": "TEST_updated_reason"},
            headers=_hdr(admin_auth), timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["reason"] == "TEST_updated_reason"

    def test_patch_empty_400(self, admin_auth, appt_id):
        r = requests.patch(
            f"{API}/appointments/{appt_id}",
            json={},
            headers=_hdr(admin_auth), timeout=30,
        )
        assert r.status_code == 400


# ---------- Block time slot ----------
class TestBlockSlot:
    def test_block_requires_doctor_role(self, admin_auth, patient_auth, pharmacy_auth):
        sched = (datetime.now(timezone.utc) + timedelta(days=1, hours=4)).isoformat()
        payload = {"scheduled_at": sched, "reason": "TEST_blk_admin", "duration_minutes": 30}
        for who in (admin_auth, patient_auth, pharmacy_auth):
            r = requests.post(
                f"{API}/appointments/block",
                json=payload,
                headers=_hdr(who), timeout=30,
            )
            assert r.status_code == 403, f"role {who['user']['role']} should be 403; got {r.status_code}"

    def test_block_unauth_401_or_403(self):
        sched = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        r = requests.post(
            f"{API}/appointments/block",
            json={"scheduled_at": sched, "reason": "TEST", "duration_minutes": 30},
            timeout=30,
        )
        assert r.status_code in (401, 403)

    def test_block_doctor_creates(self, doctor_auth):
        sched = (datetime.now(timezone.utc) + timedelta(days=1, hours=6)).isoformat()
        r = requests.post(
            f"{API}/appointments/block",
            json={"scheduled_at": sched, "reason": "TEST_lunch_break", "duration_minutes": 45},
            headers=_hdr(doctor_auth), timeout=30,
        )
        assert r.status_code == 200, r.text
        appt = r.json()
        assert appt["is_block"] is True
        assert appt["status"] == "cancelled"  # never shown in queue
        assert appt["patient_id"] is None
        assert appt["duration_minutes"] == 45
        assert appt["doctor_id"] == doctor_auth["user"]["id"]
        assert appt["reason"] == "TEST_lunch_break"

    def test_block_can_be_unblocked_via_patch(self, doctor_auth, admin_auth):
        sched = (datetime.now(timezone.utc) + timedelta(days=2, hours=2)).isoformat()
        r = requests.post(
            f"{API}/appointments/block",
            json={"scheduled_at": sched, "reason": "TEST_to_unblock", "duration_minutes": 30},
            headers=_hdr(doctor_auth), timeout=30,
        )
        assert r.status_code == 200
        block_id = r.json()["id"]
        # frontend unblocks by PATCH status=cancelled (already cancelled, but operation must succeed)
        r2 = requests.patch(
            f"{API}/appointments/{block_id}",
            json={"status": "cancelled"},
            headers=_hdr(admin_auth), timeout=30,
        )
        assert r2.status_code == 200


# ---------- Regression: earlier flows still alive ----------
class TestRegression:
    def test_kiosk_lookup_known(self):
        r = requests.get(f"{API}/kiosk/lookup/{PATIENT_IC}", timeout=15)
        assert r.status_code == 200
        assert r.json()["patient"]["ic_number"] == PATIENT_IC

    def test_kiosk_lookup_unknown_404(self):
        r = requests.get(f"{API}/kiosk/lookup/IC-DOES-NOT-EXIST-XYZ", timeout=15)
        assert r.status_code == 404

    def test_pharmacy_queue_for_role(self, pharmacy_auth):
        r = requests.get(f"{API}/pharmacy/queue", headers=_hdr(pharmacy_auth), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_availability_slots(self, doctor_auth):
        doc_id = doctor_auth["user"]["id"]
        r = requests.get(f"{API}/availability/{doc_id}", headers=_hdr(doctor_auth), timeout=15)
        assert r.status_code == 200, r.text
        assert "hours" in r.json()
        # slots endpoint by doctor id
        r2 = requests.get(f"{API}/availability/{doc_id}/slots", params={"date": datetime.now(timezone.utc).strftime("%Y-%m-%d")}, headers=_hdr(doctor_auth), timeout=15)
        assert r2.status_code == 200, r2.text
        slots_resp = r2.json()
        assert isinstance(slots_resp, dict)
        assert "slots" in slots_resp
        assert isinstance(slots_resp["slots"], list)

    def test_doctors_list(self, patient_auth):
        r = requests.get(f"{API}/doctors", headers=_hdr(patient_auth), timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_all_four_roles_login(self, admin_auth, doctor_auth, pharmacy_auth, patient_auth):
        assert admin_auth["user"]["role"] == "admin"
        assert doctor_auth["user"]["role"] == "doctor"
        assert pharmacy_auth["user"]["role"] == "pharmacist"
        assert patient_auth["user"]["role"] == "patient"
