"""
Trim MediLink down to a minimal demo roster on BOTH local and cloud.

KEEP:
  - every super_admin
  - the OLDEST clinic_admin (+ legacy 'admin')
  - the doctor whose name contains "Nur Aisyah"
  - the OLDEST pharmacist
  - the OLDEST receptionist
  - patient Nehapreet Kaur  (IC 030305-14-0854) + all her data

DELETE everyone else, and ALL patient data except Nehapreet's.

Run inside the backend container:
    docker compose exec -T backend python cleanup_roster.py
It prints exactly who it kept and deleted. Idempotent.
"""
import asyncio
from server import (database, cloud_db, users_t, appointments_t, records_t,
                    payments_t, lab_orders_t, attachments_t, vaccinations_t,
                    ic_index, IS_CLOUD)

KEEP_PATIENT_IC = "030305-14-0854"          # Nehapreet Kaur
KEEP_DOCTOR_NAME = "nur aisyah"             # matched case-insensitively

CHILD = [appointments_t, records_t, payments_t, lab_orders_t,
         attachments_t, vaccinations_t]


def _oldest(rows):
    """Pick the earliest-created row (stable), or None."""
    if not rows:
        return None
    return sorted(rows, key=lambda r: (r.get("created_at") or ""))[0]


async def decide_keepers(db):
    users = [dict(u) for u in await db.fetch_all(users_t.select())]
    keep_ids = set()

    # super admins: keep all
    for u in users:
        if u.get("role") == "super_admin":
            keep_ids.add(u["id"])

    # oldest clinic_admin (or legacy 'admin' that isn't super)
    admins = [u for u in users if u.get("role") in ("clinic_admin", "admin")]
    a = _oldest(admins)
    if a:
        keep_ids.add(a["id"])

    # the specific doctor (Nur Aisyah); fall back to oldest doctor if not found
    docs = [u for u in users if u.get("role") == "doctor"]
    aisyah = [u for u in docs if KEEP_DOCTOR_NAME in (u.get("name") or "").lower()]
    d = aisyah[0] if aisyah else _oldest(docs)
    if d:
        keep_ids.add(d["id"])

    # oldest pharmacist
    ph = _oldest([u for u in users if u.get("role") == "pharmacist"])
    if ph:
        keep_ids.add(ph["id"])

    # oldest receptionist
    rc = _oldest([u for u in users if u.get("role") == "receptionist"])
    if rc:
        keep_ids.add(rc["id"])

    # the one patient we keep
    keep_pat_hash = ic_index(KEEP_PATIENT_IC)
    for u in users:
        if u.get("role") == "patient" and u.get("ic_hash") == keep_pat_hash:
            keep_ids.add(u["id"])

    return users, keep_ids


async def clean(db, label):
    if db is None:
        print(f"[{label}] no connection — skipped")
        return
    users, keep_ids = await decide_keepers(db)

    kept, deleted = [], []
    for u in users:
        tag = f"{u.get('role')}: {u.get('name')}"
        if u["id"] in keep_ids:
            kept.append(tag)
            continue
        # delete this user's child data first
        for tbl in CHILD:
            if "patient_id" in tbl.c:
                await db.execute(tbl.delete().where(tbl.c.patient_id == u["id"]))
        await db.execute(payments_t.delete().where(payments_t.c.paid_by == u["id"]))
        await db.execute(users_t.delete().where(users_t.c.id == u["id"]))
        deleted.append(tag)

    # Also purge any orphan patient-data for patients no longer kept (belt & braces)
    keep_patient_ids = [u["id"] for u in users if u["id"] in keep_ids and u.get("role") == "patient"]
    for tbl in CHILD:
        if "patient_id" in tbl.c and keep_patient_ids:
            # delete child rows whose patient_id is NOT a kept patient
            rows = [dict(r) for r in await db.fetch_all(tbl.select())]
            for r in rows:
                if r.get("patient_id") and r["patient_id"] not in keep_patient_ids:
                    await db.execute(tbl.delete().where(tbl.c.id == r["id"]))

    print(f"\n[{label}] KEPT ({len(kept)}):")
    for k in sorted(kept):
        print("   ✓", k)
    print(f"[{label}] DELETED ({len(deleted)}):")
    for d in sorted(deleted):
        print("   ✗", d)


async def main():
    await database.connect()
    if cloud_db and not IS_CLOUD:
        await cloud_db.connect()
    await clean(database, "LOCAL")
    if cloud_db and not IS_CLOUD:
        await clean(cloud_db, "CLOUD")
        await cloud_db.disconnect()
    await database.disconnect()
    print("\nDONE.")

asyncio.run(main())
