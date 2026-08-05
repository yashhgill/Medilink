"""
Delete unwanted demo patients (and ALL their child data) from BOTH local and
cloud, keeping only the two real accounts. Run inside the backend container:

    docker compose exec -T backend python cleanup_patients.py

KEEP:
    Hashpreet Singh Gill  050422-10-1707
    Nehapreet Kaur Gill   030305-14-0854
DELETE (by IC): everyone else whose ic_hash matches the list below.
"""
import asyncio
from server import (database, cloud_db, users_t, appointments_t, records_t,
                    payments_t, lab_orders_t, attachments_t, vaccinations_t,
                    ic_index, IS_CLOUD)

KEEP_ICS = ["050422-10-1707", "030305-14-0854"]

# ICs to delete outright (the duplicates + unrelated demo patients seen on file)
DELETE_ICS = [
    "880505-10-5432",   # Ahmad
    "020920-10-5471",   # Hashpreet duplicate (wrong IC from earlier seed)
    "990518-14-5388",   # Nehapreet duplicate (wrong IC from earlier seed)
    "040412-08-1035",   # Yashpreet Singh Gill
]

CHILD = [appointments_t, records_t, payments_t, lab_orders_t,
         attachments_t, vaccinations_t]


async def purge(db, label):
    if db is None:
        print(f"[{label}] no connection — skipped")
        return
    keep_hashes = {ic_index(x) for x in KEEP_ICS}
    removed_users = 0
    removed_child = 0

    # Resolve target user ids: anything whose ic_hash is in DELETE list,
    # OR any patient NOT in the keep list and not staff (belt & braces on demo data).
    del_hashes = {ic_index(x) for x in DELETE_ICS}
    targets = []
    for r in await db.fetch_all(users_t.select().where(users_t.c.role == "patient")):
        d = dict(r)
        h = d.get("ic_hash")
        if h in keep_hashes:
            continue                      # protect the two we keep
        if h in del_hashes:
            targets.append(d["id"])

    for pid in targets:
        for tbl in CHILD:
            if "patient_id" in tbl.c:
                res = await db.execute(tbl.delete().where(tbl.c.patient_id == pid))
            # payments also reference paid_by
        # payments by paid_by too
        await db.execute(payments_t.delete().where(payments_t.c.paid_by == pid))
        await db.execute(users_t.delete().where(users_t.c.id == pid))
        removed_users += 1

    # tidy orphaned payments referencing deleted appointments is out of scope;
    # counts below reflect the user rows removed.
    print(f"[{label}] deleted {removed_users} patient(s) + their child rows")

    # show what remains
    remaining = []
    for r in await db.fetch_all(users_t.select().where(users_t.c.role == "patient")):
        d = dict(r); remaining.append(d.get("name"))
    print(f"[{label}] remaining patients ({len(remaining)}): {remaining}")


async def main():
    await database.connect()
    if cloud_db and not IS_CLOUD:
        await cloud_db.connect()
    await purge(database, "LOCAL")
    if cloud_db and not IS_CLOUD:
        await purge(cloud_db, "CLOUD")
        await cloud_db.disconnect()
    await database.disconnect()
    print("DONE.")

asyncio.run(main())
