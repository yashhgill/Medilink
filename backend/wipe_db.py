"""
Wipe the entire MediLink database clean and (optionally) bootstrap ONE super-admin.

Run inside the backend container:
    docker compose exec -T backend python wipe_db.py

Reads DATABASE_URL from the environment (same as the app). Bootstraps a super-admin
if SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are set. Idempotent-safe: it always
clears everything first, so a second run just re-clears.
"""
import os
from sqlalchemy import create_engine, text

# Reuse the app's password hashing so the bootstrap admin can log in.
from server import hash_pw, uid, now_iso, FACILITY_ID  # noqa

DB = os.environ.get("DATABASE_URL", "")
if DB.startswith("postgresql://"):
    DB = DB.replace("postgresql://", "postgresql+psycopg2://")
if not DB:
    raise SystemExit("DATABASE_URL not set")

TABLES = ["dispense_records", "stock_movements", "attachments", "vaccinations",
          "medical_records", "payments", "appointments", "pharmacy_inventory",
          "audit_logs", "counters", "sync_queue", "users"]

eng = create_engine(DB)
with eng.begin() as c:
    for t in TABLES:
        try:
            c.execute(text(f"DELETE FROM {t}"))
            print(f"cleared {t}")
        except Exception as e:
            print(f"skip {t}: {e}")

    sa_email = os.environ.get("SUPER_ADMIN_EMAIL") or os.environ.get("ADMIN_EMAIL")
    sa_pw    = os.environ.get("SUPER_ADMIN_PASSWORD") or os.environ.get("ADMIN_PASSWORD")
    if sa_email and sa_pw:
        c.execute(text("""
            INSERT INTO users (id, email, password_hash, activated, name, role,
                               phone, slot_minutes, facility_id, source,
                               created_at, updated_at, sync_status)
            VALUES (:id, :email, :ph, true, :name, 'super_admin',
                    :phone, 30, :fac, 'bootstrap', :now, :now, 'local')
        """), {
            "id": uid(), "email": sa_email.lower(), "ph": hash_pw(sa_pw),
            "name": os.environ.get("SUPER_ADMIN_NAME", "Super Admin"),
            "phone": os.environ.get("SUPER_ADMIN_PHONE"),
            "fac": FACILITY_ID, "now": now_iso(),
        })
        print(f"bootstrapped super-admin: {sa_email}")
    else:
        print("no SUPER_ADMIN_EMAIL/PASSWORD in env — database left with 0 users")

print("DONE — database is clean.")
