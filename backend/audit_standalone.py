"""
Core (standalone) hardening audit.

Boots the app exactly as a freshly installed Core clinic would, walks a real
patient all the way through, then sweeps every remaining route and reports what
broke.

    cd backend && python3 audit_standalone.py

Reads nothing from your real install: it uses a throwaway SQLite database in a
temp directory, so it is safe to run any time.

Why this exists: Core is the tier most customers will buy and the one that has
to work with no cloud, no Postgres and no internet. A route that 500s on that
build is a clinic that can't work, and "it worked on the networked demo" is not
a defence.
"""
import asyncio
import json
import os
import shutil
import sys
import tempfile

RESET, RED, GRN, YEL, DIM, BOLD = "\033[0m", "\033[31m", "\033[32m", "\033[33m", "\033[2m", "\033[1m"

TMP = tempfile.mkdtemp(prefix="harnova-audit-")
os.environ.update({
    "DEPLOYMENT_MODE": "standalone",
    "MEDILINK_DATA_DIR": TMP,
    "ALLOW_SEED": "false",
    "KIOSK_TOKEN": "audit-kiosk-token",
    "MEDILINK_LICENCE_API": "http://127.0.0.1:9/api",   # deliberately unreachable
})
os.environ.pop("DATABASE_URL", None)
os.environ.pop("CLOUD_DATABASE_URL", None)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import logging
logging.disable(logging.WARNING)

import httpx                       # noqa: E402
import server                      # noqa: E402

RESULTS = []
CTX = {}


def record(group, method, path, status, note="", expected=None):
    expected = expected or range(200, 400)
    ok = status in expected if not isinstance(expected, range) else status in expected
    RESULTS.append({"group": group, "method": method, "path": path,
                    "status": status, "ok": ok, "note": note})
    mark = f"{GRN}ok  {RESET}" if ok else f"{RED}FAIL{RESET}"
    extra = f"  {DIM}{note}{RESET}" if note else ""
    print(f"   {mark} [{status}] {method:6} {path}{extra}")
    return ok


async def call(c, method, path, expected=None, group="", **kw):
    try:
        r = await c.request(method, path, **kw)
    except Exception as e:
        record(group, method, path, 0, f"{type(e).__name__}: {e}", expected)
        return None
    note = ""
    if r.status_code >= 400:
        try:
            note = json.dumps(r.json())[:150]
        except Exception:
            note = r.text[:150]
    record(group, method, path, r.status_code, note, expected)
    try:
        return r.json()
    except Exception:
        return r.content


async def main():
    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://audit",
                                 timeout=30) as c:
        async with server.app.router.lifespan_context(server.app):

            print(f"\n{BOLD}Pulih — standalone audit{RESET}")
            print(f"{DIM}data dir: {TMP}{RESET}")
            print(f"{DIM}mode: {server.DEPLOYMENT_MODE} | db: {server.DATABASE_URL}"
                  f" | cloud: {server.cloud_db}{RESET}")

            # ── 1. a brand new install ──────────────────────────────────────
            print(f"\n{BOLD}1. Fresh install{RESET}")
            await call(c, "GET", "/api/health", group="boot")
            await call(c, "GET", "/api/", group="boot")
            await call(c, "GET", "/api/setup/status", group="boot")
            await call(c, "GET", "/api/ic/parse/900101-14-5555", group="boot")

            # ── 2. setup wizard ─────────────────────────────────────────────
            print(f"\n{BOLD}2. Setup wizard{RESET}")
            d = await call(c, "POST", "/api/setup", group="setup", expected=range(200, 400),
                           json={"clinic_name": "Klinik Audit", "admin_name": "Dr Audit",
                                 "admin_email": "admin@audit.my", "admin_password": "auditpass123",
                                 "clinic_address": "Melaka", "clinic_phone": "0123456789"})
            if not d or "token" not in d:
                print(f"{RED}Setup failed; cannot continue.{RESET}")
                return
            A = {"Authorization": f"Bearer {d['token']}"}
            K = {"X-Kiosk-Token": "audit-kiosk-token"}
            CTX["admin"] = A

            await call(c, "POST", "/api/setup", group="setup", expected=[409],
                       json={"clinic_name": "x", "admin_name": "x",
                             "admin_email": "x@x.my", "admin_password": "xxxxxxxx"})

            # ── 3. staff ────────────────────────────────────────────────────
            print(f"\n{BOLD}3. Staff accounts{RESET}")
            staff = {}
            for role, name, email in [
                ("doctor", "Dr Nur Aisyah", "doctor@audit.my"),
                ("pharmacist", "Pn Siti", "pharmacy@audit.my"),
                ("receptionist", "En Rahim", "reception@audit.my"),
            ]:
                r = await call(c, "POST", "/api/admin/staff", group="staff", headers=A,
                               json={"name": name, "email": email, "role": role,
                                     "password": "staffpass123"})
                if isinstance(r, dict):
                    staff[role] = r
            await call(c, "GET", "/api/admin/staff", group="staff", headers=A)

            # log in as the doctor, since the doctor console is the busiest screen
            dlogin = await call(c, "POST", "/api/auth/login", group="staff",
                                json={"email": "doctor@audit.my", "password": "staffpass123"})
            D = {"Authorization": f"Bearer {dlogin['token']}"} if isinstance(dlogin, dict) and dlogin.get("token") else A
            plogin = await call(c, "POST", "/api/auth/login", group="staff",
                                json={"email": "pharmacy@audit.my", "password": "staffpass123"})
            P = {"Authorization": f"Bearer {plogin['token']}"} if isinstance(plogin, dict) and plogin.get("token") else A
            rlogin = await call(c, "POST", "/api/auth/login", group="staff",
                                json={"email": "reception@audit.my", "password": "staffpass123"})
            R = {"Authorization": f"Bearer {rlogin['token']}"} if isinstance(rlogin, dict) and rlogin.get("token") else A

            # ── 4. branding (white-label) ───────────────────────────────────
            print(f"\n{BOLD}4. Branding{RESET}")
            await call(c, "GET", "/api/branding", group="branding")
            await call(c, "PATCH", "/api/branding", group="branding", headers=A,
                       json={"clinic_name": "Klinik Audit", "registration_no": "KKM-1234",
                             "letterhead_line1": "Jalan Audit", "footer_note": "Thank you"})

            # ── 5. the patient journey ──────────────────────────────────────
            print(f"\n{BOLD}5. Patient journey{RESET}")
            reg = await call(c, "POST", "/api/kiosk/register", group="journey", headers=K,
                             json={"name": "Ahmad bin Ali", "ic_number": "900101-14-5555",
                                   "phone": "0121234567"})
            pid = (reg or {}).get("id") or (reg or {}).get("patient", {}).get("id")
            await call(c, "GET", "/api/kiosk/lookup/900101-14-5555", group="journey", headers=K)

            await call(c, "GET", "/api/doctors", group="journey", headers=A)
            docs = await call(c, "GET", "/api/doctors", group="journey", headers=A)
            did = docs[0]["id"] if isinstance(docs, list) and docs else None
            CTX["doctor_id"] = did

            # triage is a STAFF action (doctor/admin/receptionist), not a kiosk one
            await call(c, "POST", "/api/ai/triage", group="journey", headers=D,
                       json={"patient_id": pid,
                             "chief_complaint": "chest pain and shortness of breath",
                             "pain_score": 8, "duration": "2 hours",
                             "vitals": {"bp": "150/95", "hr": 104, "temp": 37.1}})
            chk = await call(c, "POST", "/api/kiosk/checkin", group="journey", headers=K,
                             json={"ic_number": "900101-14-5555",
                                   "symptoms": "chest pain and shortness of breath"})
            appt_id = (chk or {}).get("appointment", {}).get("id") if isinstance(chk, dict) else None
            if not appt_id and isinstance(chk, dict):
                appt_id = chk.get("id")
            CTX["appt"] = appt_id

            await call(c, "GET", "/api/queue/today", group="journey", headers=A)
            await call(c, "GET", "/api/appointments", group="journey", headers=D)
            # a patient cannot pay (and so release medicine) before seeing the doctor
            await call(c, "POST", "/api/kiosk/pay", group="journey", headers=K, expected=[409],
                       json={"ic_number": "900101-14-5555", "appointment_id": appt_id, "method": "cash"})

            # consultation
            rec = await call(c, "POST", "/api/records", group="journey", headers=D,
                             json={"patient_id": pid, "appointment_id": appt_id,
                                   "diagnosis": "Angina, suspected",
                                   "notes": "ECG advised. Referred for observation.",
                                   "prescription": "Aspirin 300mg stat"})
            rid = (rec or {}).get("id")
            CTX["record"] = rid
            if pid:
                await call(c, "GET", f"/api/records/patient/{pid}", group="journey", headers=D)
                await call(c, "GET", f"/api/patients/{pid}", group="journey", headers=D)
                await call(c, "GET", f"/api/patients/{pid}/vaccinations", group="journey", headers=D)

            # labs
            await call(c, "GET", "/api/lab/catalog", group="labs", headers=D)
            cat = await call(c, "GET", "/api/lab/catalog", group="labs", headers=D)
            code = (cat[0].get("code") if isinstance(cat, list) and cat and isinstance(cat[0], dict)
                    else "FBC")
            await call(c, "POST", "/api/lab/orders", group="labs", headers=D,
                       json={"patient_id": pid, "test_code": code, "record_id": rid})
            await call(c, "GET", "/api/lab/orders", group="labs", headers=D)

            # pharmacy
            print(f"\n{BOLD}6. Pharmacy{RESET}")
            await call(c, "POST", "/api/inventory", group="pharmacy", headers=P,
                       json={"name": "Aspirin 300mg", "generic_name": "Aspirin",
                             "category": "Analgesic", "unit": "tablet", "quantity": 100,
                             "reorder_level": 20, "unit_price": 0.20,
                             "expiry_date": "2027-01-01", "batch_no": "ASP-1"})
            await call(c, "GET", "/api/inventory", group="pharmacy", headers=P)
            await call(c, "GET", "/api/inventory/summary", group="pharmacy", headers=P)
            await call(c, "GET", "/api/inventory/low-stock", group="pharmacy", headers=P)
            await call(c, "GET", "/api/pharmacy/queue", group="pharmacy", headers=P)
            await call(c, "GET", "/api/pharmacy/expiry-alerts", group="pharmacy", headers=P)

            # billing
            print(f"\n{BOLD}7. Billing{RESET}")
            if appt_id:
                # a self-registered patient cannot touch someone else's visit
                preg = await call(c, "POST", "/api/auth/register", group="billing",
                                  json={"email": "nosy@audit.my", "password": "patientpass123",
                                        "name": "Nosy Patient", "ic_number": "910202-10-1234"})
                PT = {"Authorization": f"Bearer {preg['token']}"} if isinstance(preg, dict) and preg.get("token") else None
                if PT:
                    await call(c, "PATCH", f"/api/appointments/{appt_id}", group="billing", headers=PT,
                               expected=[403, 404], json={"status": "ready_for_pharmacy", "fee": 0})
                # medicine cannot be released by editing the status of an unpaid visit
                await call(c, "PATCH", f"/api/appointments/{appt_id}", group="billing", headers=R, expected=[409],
                           json={"status": "ready_for_pharmacy"})
                paid = await call(c, "POST", "/api/kiosk/pay", group="billing", headers=K,
                                  json={"ic_number": "900101-14-5555",
                                        "appointment_id": appt_id, "method": "duitnow"})
                ref = ((paid or {}).get("payment") or {}).get("ref") if isinstance(paid, dict) else None
                await call(c, "GET", "/api/payments/pending", group="billing", headers=R)
                if ref:
                    # the kiosk saying "paid" does not release medicine; staff do
                    await call(c, "POST", f"/api/kiosk/payment-confirm/{ref}", group="billing", headers=K)
                    q = await call(c, "GET", "/api/pharmacy/queue", group="billing", headers=P)
                    early = isinstance(q, list) and any(x.get("id") == appt_id for x in q)
                    record("billing", "CHECK", "medicine held until staff confirm", 200 if not early else 500,
                           "" if not early else "released on a self-confirmed payment")
                    await call(c, "POST", f"/api/payments/{ref}/confirm", group="billing", headers=P, expected=[403])
                    await call(c, "POST", f"/api/payments/{ref}/confirm", group="billing", headers=R)
                    await call(c, "POST", f"/api/payments/{ref}/confirm", group="billing", headers=R)
            await call(c, "GET", "/api/admin/stats", group="billing", headers=A)
            await call(c, "GET", "/api/admin/analytics", group="billing", headers=A)

            # documents (the PDFs a clinic actually prints)
            print(f"\n{BOLD}8. Printed documents{RESET}")
            if rid:
                await call(c, "GET", f"/api/records/{rid}/mc/pdf", group="pdf", headers=D)
            if pid:
                await call(c, "GET", f"/api/lab/patient/{pid}/report/pdf", group="pdf", headers=D)
                await call(c, "GET", f"/api/patients/{pid}/vaccinations/pdf", group="pdf", headers=D)
            await call(c, "GET", "/api/admin/cash-report/pdf", group="pdf", headers=A)
            await call(c, "POST", "/api/referrals/pdf", group="pdf", headers=D,
                       json={"patient_id": pid, "record_id": rid,
                             "refer_to": "Hospital Melaka (Cardiology)",
                             "reason": "Suspected angina, needs review",
                             "clinical_summary": "Chest pain on exertion."})

            # admin surfaces
            print(f"\n{BOLD}9. Admin surfaces{RESET}")
            await call(c, "GET", "/api/facilities", group="admin", headers=A)
            await call(c, "GET", "/api/audit/logs", group="admin", headers=A)
            await call(c, "GET", "/api/sync/status", group="admin", headers=A)
            await call(c, "GET", "/api/sync/queue", group="admin", headers=A)
            await call(c, "GET", "/api/admin/monitoring", group="admin", headers=A)

            # Connect-only features must be refused, not crash
            print(f"\n{BOLD}10. Connect-only features are correctly withheld{RESET}")
            await call(c, "POST", "/api/sync/full", group="tier", headers=A, expected=[400, 402])
            await call(c, "POST", "/api/sync/trigger", group="tier", headers=A,
                       expected=list(range(200, 400)) + [400, 402])

    # ── report ──────────────────────────────────────────────────────────────
    fails = [r for r in RESULTS if not r["ok"]]
    print(f"\n{BOLD}{'─' * 66}{RESET}")
    print(f"{BOLD}RESULT{RESET}  {len(RESULTS) - len(fails)}/{len(RESULTS)} passed")
    if fails:
        print(f"\n{RED}{BOLD}Broken on Core:{RESET}")
        for f in fails:
            print(f"  {RED}✗{RESET} [{f['status']}] {f['method']} {f['path']}")
            if f["note"]:
                print(f"      {DIM}{f['note']}{RESET}")
    else:
        print(f"{GRN}Every checked route works on a standalone Core install.{RESET}")
    shutil.rmtree(TMP, ignore_errors=True)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()) or 0)
