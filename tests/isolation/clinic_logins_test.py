"""Per-clinic cloud logins (migration 004) and the in-app cloud connection.

Run after run_isolation.sh has built rlsdb (it leaves the database in place):
    CLOUD_ADMIN_URL=postgresql://postgres@127.0.0.1:5433/rlsdb python clinic_logins_test.py
Writes results/clinic_logins.json.
"""
import asyncio, json, os, subprocess, sys, tempfile, time
from pathlib import Path
import asyncpg, httpx

ROOT = Path(__file__).resolve().parents[2]
ADMIN = os.environ.get("CLOUD_ADMIN_URL", "postgresql://postgres@127.0.0.1:5433/rlsdb")
OUT = Path(__file__).parent / "results"; OUT.mkdir(exist_ok=True)
rows = []

def check(name, expected, actual, ok):
    rows.append([name, expected, str(actual), "Pass" if ok else "FAIL"])
    print(("PASS " if ok else "FAIL ") + f"{name}: expected {expected}, got {actual}")

def issue_key(facility, name):
    out = subprocess.run([sys.executable, str(ROOT / "tools" / "provision_clinic.py"), facility, name],
                         env={**os.environ, "CLOUD_ADMIN_URL": ADMIN}, capture_output=True, text=True, check=True).stdout
    return next(l for l in out.splitlines() if l.startswith("mlk1."))

def key_url(key):
    import base64
    raw = key[5:]
    return json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))["u"]

async def as_login(url, sql, *args, pretend=None):
    con = await asyncpg.connect(url, server_settings={"search_path": "medilink"})
    try:
        async with con.transaction():
            if pretend:
                await con.execute("SELECT set_config('app.facility_id', $1, true)", pretend)
            return await con.fetchval(sql, *args)
    finally:
        await con.close()

async def main():
    sup = await asyncpg.connect(ADMIN)
    await sup.execute("INSERT INTO medilink.medical_records (id, patient_id, facility_id, diagnosis) VALUES ('mel-secret', 'p', 'melaka', 'secret') ON CONFLICT DO NOTHING")

    ka, kb = issue_key("trial-a", "Klinik Trial A"), issue_key("trial-b", "Klinik Trial B")
    ua, ub = key_url(ka), key_url(kb)

    who = await as_login(ua, "SELECT medilink.current_facility()")
    check("Trial A's login is recognised as Trial A by the database", "trial-a", who, who == "trial-a")
    who = await as_login(ua, "SELECT medilink.current_facility()", pretend="melaka")
    check("Trial A claims to be Melaka", "still trial-a", who, who == "trial-a")
    n = await as_login(ua, "SELECT count(*) FROM medilink.medical_records WHERE facility_id='melaka'", pretend="melaka")
    check("Trial A, claiming to be Melaka, reads Melaka's records", "0", n, n == 0)
    try:
        await as_login(ua, "INSERT INTO medilink.medical_records (id, patient_id, facility_id, diagnosis) VALUES ($1,'x','trial-b','forged') RETURNING 1", f"forge-b-{time.time_ns()}")
        forged = "accepted"
    except Exception:
        forged = "refused"
    check("Trial A writes a row labelled as Trial B's", "refused", forged, forged == "refused")
    own = await as_login(ua, "INSERT INTO medilink.medical_records (id, patient_id, facility_id, diagnosis) VALUES ($1,'x','trial-a','ok') RETURNING 1", f"own-a-{time.time_ns()}")
    check("Trial A writes its own row", "accepted", "accepted" if own == 1 else own, own == 1)
    try:
        await as_login(ua, "CREATE TABLE medilink.evil (x int)")
        ddl = "allowed"
    except Exception:
        ddl = "refused"
    check("Trial A changes the cloud's tables", "refused", ddl, ddl == "refused")

    await sup.execute("DROP ROLE IF EXISTS clinic_rogue")
    await sup.execute("CREATE ROLE clinic_rogue LOGIN IN ROLE medilink_clinic")
    rogue_url = ADMIN.replace("postgres@", "clinic_rogue@", 1)
    n = await as_login(rogue_url, "SELECT count(*) FROM medilink.medical_records", pretend="melaka")
    check("A clinic login with no record, claiming Melaka, sees records", "0", n, n == 0)

    await sup.execute("SELECT medilink.suspend_clinic('trial-b')")
    try:
        await as_login(ub, "SELECT 1"); suspended = "still logs in"
    except Exception:
        suspended = "refused"
    check("A suspended trial clinic logs in", "refused", suspended, suspended == "refused")

    # ── The desktop app connects itself with a key ───────────────────────────
    home = Path(tempfile.mkdtemp(prefix="ml-desk-"))
    env = {**{k: v for k, v in os.environ.items() if not k.startswith(("CLOUD_", "DEPLOYMENT_MODE", "FACILITY_ID", "MEDILINK_", "DATABASE_URL"))},
           "HOME": str(home), "XDG_DATA_HOME": str(home / "data")}
    port = 8131
    app = [os.environ["MEDILINK_APP_BIN"]] if os.environ.get("MEDILINK_APP_BIN") else [sys.executable, str(ROOT / "packaging" / "medilink_app.py")]
    proc = subprocess.Popen(app + ["--port", str(port)],
                            env=env, stdout=open(home / "app.log", "w"), stderr=subprocess.STDOUT)
    B = f"http://127.0.0.1:{port}/api"
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            for _ in range(60):
                try:
                    if (await c.get(B + "/health")).status_code == 200: break
                except Exception: pass
                await asyncio.sleep(0.5)
            await c.post(B + "/setup", json={"clinic_name": "Klinik Desk", "admin_name": "Admin", "admin_email": "admin@desk.my", "admin_password": "Admin@12345"})
            tok = (await c.post(B + "/auth/login", json={"email": "admin@desk.my", "password": "Admin@12345"})).json()["token"]
            H = {"Authorization": f"Bearer {tok}"}
            clinic_id = (await c.get(B + "/admin/cloud", headers=H)).json()["clinic_id"]
            wrong = await c.post(B + "/admin/cloud/connect", headers=H, json={"key": ka})
            check("The app accepts another clinic's key", "refused (409)", wrong.status_code, wrong.status_code == 409)
            key = issue_key(clinic_id, "Klinik Desk")
            r = await c.post(B + "/admin/cloud/connect", headers=H, json={"key": key})
            check("The app connects with its own key", "accepted, restarting", r.json(), r.status_code == 200)
            await asyncio.sleep(3)
            up = False
            for _ in range(60):
                try:
                    st = (await c.get(B + "/admin/cloud", headers=H)).json()
                    if st.get("connected"): up = True; break
                except Exception: pass
                await asyncio.sleep(0.5)
            check("After its restart the app is connected", "connected", "connected" if up else "not connected", up)
            pid = (await c.post(B + "/kiosk/register", headers={"X-Kiosk-Token": "demo-kiosk-token"},
                                json={"name": "Desk Patient", "ic_number": "900101-14-5577", "phone": "0123"})).json()["patient"]["id"]
            seen = 0
            for _ in range(40):
                seen = await sup.fetchval("SELECT count(*) FROM medilink.users WHERE id=$1 AND facility_id=$2", pid, clinic_id)
                if seen: break
                await asyncio.sleep(0.5)
            check("A patient registered at the desktop clinic reaches the cloud under its own clinic", "present", "present" if seen else "missing", bool(seen))
    finally:
        proc.terminate()
        await sup.close()

    res = {"method": "Each trial clinic was given its own cloud login with tools/provision_clinic.py (migration 004). The checks connect with those logins directly, and drive a fresh desktop install through Settings → Cloud.",
           "rows": rows, "passed": sum(r[3] == "Pass" for r in rows), "total": len(rows)}
    (OUT / "clinic_logins.json").write_text(json.dumps(res, indent=2))
    print(f"{res['passed']}/{res['total']} passed")

asyncio.run(main())
