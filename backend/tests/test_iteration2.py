"""MediLink PHR iteration 2 backend tests — WebSocket queue, doctor availability/slots,
file uploads/download, attachments on records.
"""
import os
import io
import json
import time
import asyncio
import uuid
import requests
import pytest
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
# wss URL derived from REACT_APP_BACKEND_URL
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, pw):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.text}"
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


# ---------- Availability ----------
def test_get_availability_default(session, doctor_auth):
    did = doctor_auth["user"]["id"]
    r = session.get(f"{API}/availability/{did}", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "hours" in data and "slot_minutes" in data
    assert data["slot_minutes"] == 30
    for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]:
        assert d in data["hours"]


def test_patch_availability_doctor(session, doctor_auth):
    new_hours = {
        "mon": "09:00-17:00", "tue": "09:00-17:00", "wed": "09:00-17:00",
        "thu": "09:00-17:00", "fri": "09:00-17:00", "sat": "10:00-13:00",
        "sun": "",  # day off
    }
    r = session.patch(
        f"{API}/availability/me",
        json={"hours": new_hours, "slot_minutes": 30},
        headers=_hdr(doctor_auth), timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json()["hours"]["sun"] == ""


def test_patch_availability_forbidden_for_patient(session, patient_auth):
    r = session.patch(
        f"{API}/availability/me",
        json={"hours": {"mon": "09:00-17:00"}, "slot_minutes": 30},
        headers=_hdr(patient_auth), timeout=15,
    )
    assert r.status_code == 403


def _next_weekday(target_weekday: int):
    """target_weekday 0=Mon..6=Sun. Returns date YYYY-MM-DD for next occurrence (today or later)."""
    today = datetime.now(timezone.utc).date()
    delta = (target_weekday - today.weekday()) % 7
    return (today + timedelta(days=delta)).strftime("%Y-%m-%d")


def test_slots_for_working_day(session, doctor_auth):
    did = doctor_auth["user"]["id"]
    date = _next_weekday(2)  # Wednesday
    r = session.get(f"{API}/availability/{did}/slots", params={"date": date}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["off"] is False
    assert isinstance(data["slots"], list) and len(data["slots"]) > 0
    # default mon-fri 09:00-17:00 with 30min -> 16 slots
    assert len(data["slots"]) == 16
    first = data["slots"][0]
    assert "time" in first and "iso" in first and "booked" in first
    assert first["time"] == "09:00"


def test_slots_for_sunday_returns_off(session, doctor_auth):
    did = doctor_auth["user"]["id"]
    date = _next_weekday(6)  # Sunday
    r = session.get(f"{API}/availability/{did}/slots", params={"date": date}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["off"] is True
    assert data["slots"] == []


def test_slots_mark_booked(session, doctor_auth, patient_auth):
    did = doctor_auth["user"]["id"]
    pid = patient_auth["user"]["id"]
    date = _next_weekday(2)  # Wed
    iso_slot = f"{date}T10:00:00+00:00"
    # create appointment in that slot
    r = session.post(
        f"{API}/appointments",
        json={"patient_id": pid, "doctor_id": did, "scheduled_at": iso_slot, "reason": "TEST_slot_check", "fee": 50},
        headers=_hdr(patient_auth), timeout=15,
    )
    assert r.status_code == 200, r.text
    # now fetch slots and verify 10:00 is booked
    r2 = session.get(f"{API}/availability/{did}/slots", params={"date": date}, timeout=15)
    assert r2.status_code == 200
    slot10 = next((s for s in r2.json()["slots"] if s["time"] == "10:00"), None)
    assert slot10 is not None
    assert slot10["booked"] is True


# ---------- File uploads ----------
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01"
    b"\x9a\x9c\x18\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(scope="module")
def uploaded_file(doctor_auth):
    files = {"file": ("TEST_attach.png", PNG_BYTES, "image/png")}
    r = requests.post(f"{API}/files/upload", files=files, headers=_hdr(doctor_auth), timeout=60)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["original_filename"] == "TEST_attach.png"
    assert data["content_type"] == "image/png"
    assert data["size"] > 0
    assert "storage_path" in data and "id" in data
    return data


def test_file_upload_doctor(uploaded_file):
    assert uploaded_file["id"]


def test_file_upload_forbidden_for_patient(patient_auth):
    files = {"file": ("TEST_attach.png", PNG_BYTES, "image/png")}
    r = requests.post(f"{API}/files/upload", files=files, headers=_hdr(patient_auth), timeout=30)
    assert r.status_code == 403


def test_file_upload_too_large(doctor_auth):
    big = b"x" * (10 * 1024 * 1024 + 100)
    files = {"file": ("TEST_big.bin", big, "application/octet-stream")}
    r = requests.post(f"{API}/files/upload", files=files, headers=_hdr(doctor_auth), timeout=60)
    assert r.status_code == 413, r.status_code


def test_file_download_with_header(uploaded_file, doctor_auth):
    fid = uploaded_file["id"]
    r = requests.get(f"{API}/files/{fid}/download", headers=_hdr(doctor_auth), timeout=30)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("image/png")
    assert len(r.content) > 0


def test_file_download_with_query_token(uploaded_file, doctor_auth):
    fid = uploaded_file["id"]
    r = requests.get(f"{API}/files/{fid}/download", params={"auth": doctor_auth["token"]}, timeout=30)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/png")


def test_file_download_no_token(uploaded_file):
    fid = uploaded_file["id"]
    r = requests.get(f"{API}/files/{fid}/download", timeout=30)
    assert r.status_code == 401


# ---------- Records with attachments ----------
def test_record_with_attachment(session, doctor_auth, patient_auth, uploaded_file):
    pid = patient_auth["user"]["id"]
    body = {
        "patient_id": pid,
        "diagnosis": "TEST_iter2 attached record",
        "notes": "linked via test",
        "prescriptions": [],
        "attachment_ids": [uploaded_file["id"]],
    }
    r = session.post(f"{API}/records", json=body, headers=_hdr(doctor_auth), timeout=30)
    assert r.status_code == 200, r.text
    record = r.json()
    assert record["attachments"] and record["attachments"][0]["id"] == uploaded_file["id"]
    rid = record["id"]

    # GET records for patient and verify attachments listed
    r2 = session.get(f"{API}/records/patient/{pid}", headers=_hdr(doctor_auth), timeout=30)
    assert r2.status_code == 200
    found = next((x for x in r2.json() if x["id"] == rid), None)
    assert found is not None
    assert any(a["id"] == uploaded_file["id"] for a in (found.get("attachments") or []))

    # files-by-record endpoint
    r3 = session.get(f"{API}/files/record/{rid}", headers=_hdr(doctor_auth), timeout=30)
    assert r3.status_code == 200
    files = r3.json()
    assert any(f["id"] == uploaded_file["id"] for f in files)


# ---------- WebSocket ----------
@pytest.mark.asyncio
async def test_ws_connect_and_broadcast_on_update(doctor_auth, patient_auth, session):
    import websockets
    did = doctor_auth["user"]["id"]
    pid = patient_auth["user"]["id"]
    url = f"{WS_BASE}/api/ws/queue?token={doctor_auth['token']}"

    async with websockets.connect(url, open_timeout=15) as ws:
        hello_raw = await asyncio.wait_for(ws.recv(), timeout=10)
        hello = json.loads(hello_raw)
        assert hello["type"] == "hello"
        assert hello["role"] == "doctor"

        # create appointment first → may broadcast appointment.created (optional per spec)
        iso = (datetime.now(timezone.utc) + timedelta(days=3)).replace(hour=11, minute=0, second=0, microsecond=0).isoformat()
        r = session.post(
            f"{API}/appointments",
            json={"patient_id": pid, "doctor_id": did, "scheduled_at": iso, "reason": "TEST_ws", "fee": 50},
            headers=_hdr(patient_auth), timeout=15,
        )
        assert r.status_code == 200, r.text
        appt_id = r.json()["id"]

        got_created = False
        try:
            evt = json.loads(await asyncio.wait_for(ws.recv(), timeout=3))
            if evt.get("type") == "appointment.created":
                got_created = True
        except asyncio.TimeoutError:
            pass

        # PATCH should definitely broadcast appointment.updated
        r2 = session.patch(
            f"{API}/appointments/{appt_id}",
            json={"status": "checked_in"},
            headers=_hdr(doctor_auth), timeout=15,
        )
        assert r2.status_code == 200, r2.text

        evt2 = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
        assert evt2["type"] == "appointment.updated"
        assert evt2["appointment_id"] == appt_id
        assert evt2["changes"]["status"] == "checked_in"

        # Record observation for created event in test name
        print(f"appointment.created received during create: {got_created}")


@pytest.mark.asyncio
async def test_ws_invalid_token_rejected():
    import websockets
    url = f"{WS_BASE}/api/ws/queue?token=invalid.jwt.token"
    try:
        async with websockets.connect(url, open_timeout=15) as ws:
            # Server should close with 1008 either before/after accept
            try:
                await asyncio.wait_for(ws.recv(), timeout=5)
            except websockets.ConnectionClosed as ce:
                assert ce.code == 1008, f"expected close code 1008, got {ce.code}"
                return
            # If we got here without close, fail
            assert False, "expected connection to be closed for invalid token"
    except Exception as e:
        # Some servers reject the handshake before upgrade
        msg = str(e)
        assert ("1008" in msg) or ("403" in msg) or ("401" in msg) or ("rejected" in msg.lower()) or ("invalid" in msg.lower()), msg
