"""Tenant isolation and consent test against a real cloud node.

Two clinic nodes (melaka on :8101, jasin on :8102) connect to the cloud as the
least-privilege role medilink_app created by migration 002, through the
row-level security policies. The test then checks, against the database
itself and through each clinic's API, that:

  - a clinic sees only its own rows on the cloud node,
  - an unpinned connection sees nothing (fails closed),
  - another clinic can learn THAT a patient has records elsewhere, not WHAT,
  - staff cannot approve consent on a patient's behalf,
  - with the patient's consent the records become readable, and only then,
  - an expired consent stops access again.

    python isolation_test.py   (see run_isolation.sh for the set-up)
Writes results/isolation.json.
"""
import asyncio, json, os, random, time
from pathlib import Path
import asyncpg, httpx

A = os.environ.get("CLINIC_A", "http://127.0.0.1:8101")      # melaka
B = os.environ.get("CLINIC_B", "http://127.0.0.1:8102")      # jasin
SUPER = os.environ.get("CLOUD_SUPER", "postgresql://postgres@127.0.0.1:5433/rlsdb")
APP = os.environ["CLOUD_APP"]                                   # medilink_app DSN, direct
K = {"X-Kiosk-Token": "demo-kiosk-token"}
OUT = Path(__file__).parent / "results"; OUT.mkdir(exist_ok=True)
rows = []

def check(name, expected, actual, ok):
    rows.append([name, expected, actual if isinstance(actual, str) else json.dumps(actual), "Pass" if ok else "FAIL"])
    print(("PASS " if ok else "FAIL ") + f"{name}: expected {expected}, got {actual}")

async def login(c, email, pw):
    r = await c.post("/api/auth/login", json={"email": email, "password": pw})
    return {"Authorization": f"Bearer {r.json()['token']}"}

async def wait_synced(con, sql, args, want, timeout=40):
    t = time.time()
    while time.time() - t < timeout:
        if await con.fetchval(sql, *args) >= want:
            return True
        await asyncio.sleep(0.5)
    return False

async def app_count(facility, table, extra="", args=()):
    con = await asyncpg.connect(APP, server_settings={"search_path": "medilink"})
    try:
        async with con.transaction():
            if facility is not None:
                await con.execute("SELECT set_config('app.facility_id', $1, true)", facility)
            return await con.fetchval(f"SELECT count(*) FROM medilink.{table} {extra}", *args)
    finally:
        await con.close()

async def main():
    ic = f"{random.randint(70,99)}0{random.randint(1,9)}{random.randint(10,28)}-14-{random.randint(1000,9999)}"
    async with httpx.AsyncClient(base_url=A, timeout=30) as ca, httpx.AsyncClient(base_url=B, timeout=30) as cb:
        # 1. Patient seen at Melaka; record synced to the cloud.
        da = await login(ca, "dr.tan@medilink.io", "Doctor@123")
        reg = (await ca.post("/api/kiosk/register", headers=K, json={"name": "Isolation Test", "ic_number": ic, "phone": "0123456789"})).json()
        pid_a = reg["patient"]["id"]
        chk = (await ca.post("/api/kiosk/checkin", headers=K, json={"ic_number": ic, "symptoms": "batuk berpanjangan"})).json()
        rec = (await ca.post("/api/records", headers=da, json={"patient_id": pid_a, "appointment_id": (chk.get("appointment") or {}).get("id"),
                "diagnosis": "Asthma, mild persistent", "allergies": "Aspirin"})).json()
        sup = await asyncpg.connect(SUPER)
        synced = await wait_synced(sup, "SELECT count(*) FROM medilink.medical_records WHERE id=$1", [rec["id"]], 1)
        check("Melaka's record reaches the cloud through RLS (as medilink_app)", "present", "present" if synced else "missing", synced)

        # 2. Database-level isolation, checked directly.
        n_mel = await app_count("melaka", "medical_records", "WHERE facility_id='melaka'")
        n_jas_sees_mel = await app_count("jasin", "medical_records", "WHERE facility_id='melaka'")
        n_unpinned = await app_count(None, "medical_records")
        n_jas_users_mel = await app_count("jasin", "users", "WHERE facility_id='melaka'")
        check("Melaka pinned: sees its own records", "more than 0", n_mel, n_mel > 0)
        check("Jasin pinned: sees Melaka's records", "0", n_jas_sees_mel, n_jas_sees_mel == 0)
        check("Jasin pinned: sees Melaka's patients", "0", n_jas_users_mel, n_jas_users_mel == 0)
        check("Unpinned connection: sees any record", "0", n_unpinned, n_unpinned == 0)
        try:
            con = await asyncpg.connect(APP, server_settings={"search_path": "medilink"})
            async with con.transaction():
                await con.execute("SELECT set_config('app.facility_id', 'jasin', true)")
                await con.execute("INSERT INTO medilink.medical_records (id, patient_id, facility_id, diagnosis) VALUES ('forged-1', 'x', 'melaka', 'forged')")
            forged = "accepted"
        except Exception as e:
            forged = "refused"
        finally:
            await con.close()
        check("Jasin writes a row labelled as Melaka's", "refused", forged, forged == "refused")

        # 3. Same patient arrives at Jasin. Jasin's doctor sees only that records exist.
        regb = (await cb.post("/api/kiosk/register", headers=K, json={"name": "Isolation Test", "ic_number": ic, "phone": "0123456789"})).json()
        pid_b, code_b = regb["patient"]["id"], regb.get("activation_code")
        db = await login(cb, "dr.tan@medilink.io", "Doctor@123")
        hist = (await cb.get(f"/api/records/patient/{pid_b}", headers=db)).json()
        ext = [r for r in hist if r.get("external")]
        leaked = any("Asthma" in str(r.get("diagnosis")) or "Aspirin" in str(r.get("allergies")) for r in ext)
        check("Jasin doctor without consent: told records exist at Melaka", "1 locked entry",
              f"{len(ext)} entr{'y' if len(ext) == 1 else 'ies'}, {'clinical detail visible' if leaked else 'no clinical detail'}",
              len(ext) >= 1 and not leaked)

        # 4. Staff cannot consent for the patient.
        req = (await cb.post("/api/records/request-access", headers=db, json={"patient_id": pid_b})).json()
        selfapp = await cb.post("/api/consent/approve", headers=db, json={"code": req["code"]})
        check("Jasin doctor approves their own access request", "refused (403)", str(selfapp.status_code), selfapp.status_code == 403)

        # 5. The patient consents in their app at Jasin; the record becomes readable.
        act = await cb.post("/api/auth/activate", json={"ic_number": ic, "code": code_b, "password": "Patient@12345"})
        ph = {"Authorization": f"Bearer {act.json()['token']}"}
        ok = await cb.post("/api/consent/approve", headers=ph, json={"code": req["code"]})
        await wait_synced(sup, "SELECT count(*) FROM medilink.record_consents WHERE id=$1 AND granted", [req["consent_id"]], 1)
        hist2 = (await cb.get(f"/api/records/patient/{pid_b}", headers=db)).json()
        seen = [r for r in hist2 if r.get("external") and "Asthma" in str(r.get("diagnosis"))]
        check("After the patient consents: Jasin doctor reads Melaka's record", "readable", "readable" if seen else "not readable",
              ok.status_code == 200 and len(seen) == 1)

        # 6. Expired consent: access stops, enforced by the database function.
        await sup.execute("UPDATE medilink.record_consents SET expires_at=$1 WHERE id=$2", "2020-01-01T00:00:00+00:00", req["consent_id"])
        con = await asyncpg.connect(APP, server_settings={"search_path": "medilink"})
        async with con.transaction():
            await con.execute("SELECT set_config('app.facility_id', 'jasin', true)")
            h = await con.fetchval("SELECT ic_hash FROM medilink.users WHERE id=$1", pid_b)
            n_after = await con.fetchval("SELECT count(*) FROM medilink.records_with_consent($1)", h)
        await con.close()
        check("After the consent expires: records released by the database", "0", n_after, n_after == 0)
        await sup.close()

    res = {"method": "Two clinic nodes, Melaka and Jasin, were connected to a PostgreSQL cloud node built from migration 002, using the least-privilege role medilink_app through the row-level security policies. A patient was seen at Melaka, then arrived at Jasin. Each check below was made either through the clinics' own interfaces or directly against the database as medilink_app.",
           "rows": rows, "passed": sum(r[3] == "Pass" for r in rows), "total": len(rows)}
    (OUT / "isolation.json").write_text(json.dumps(res, indent=2))
    print(f"{res['passed']}/{res['total']} passed")

asyncio.run(main())
