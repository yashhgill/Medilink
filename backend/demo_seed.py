"""Flood MediLink with realistic demo data. Idempotent — safe to re-run.
Run inside the backend container:  python demo_seed.py
"""
import asyncio, random
from server import (database, users_t, appointments_t, records_t, payments_t,
                    vaccinations_t, hash_pw, uid, now_iso, next_q, FACILITY_ID)
from datetime import datetime, timezone, timedelta

now = datetime.now(timezone.utc)

DOCTORS = [
    ("dr.aisyah@medilink.io", "Doctor@123", "Dr. Nur Aisyah binti Rahman", "Family Medicine", "MMC-61204"),
    ("dr.kumar@medilink.io",  "Doctor@123", "Dr. Rajesh Kumar",            "Internal Medicine", "MMC-58317"),
    ("dr.lim@medilink.io",    "Doctor@123", "Dr. Lim Jia Hui",             "Paediatrics", "MMC-64920"),
]
STAFF = [
    ("pharmacy2@medilink.io", "Pharm@123", "En. Hafiz bin Osman", "pharmacist"),
    ("reception2@medilink.io", "Recep@123", "Cik Tan Mei Ling", "receptionist"),
]
# (name, ic, phone, gender, password)
PATIENTS = [
    ("Ahmad Faizal bin Ismail",   "850312-10-5231", "012-334 8821", "Male",   "Demo@1234"),
    ("Siti Nurhaliza binti Aziz", "920725-10-6248", "013-556 1092", "Female", "Demo@1234"),
    ("Tan Wei Ming",              "880204-14-5567", "016-778 3345", "Male",   "Demo@1234"),
    ("Lim Xiu Ying",              "950830-14-6122", "012-887 4451", "Female", "Demo@1234"),
    ("Muthu s/o Krishnan",        "781116-08-5883", "019-223 7788", "Male",   "Demo@1234"),
    ("Priya d/o Raman",           "010507-10-0946", "011-3345 6677","Female", "Demo@1234"),
    ("Harjit Kaur",               "890922-01-5442", "017-556 9911", "Female", "Demo@1234"),
    ("Mohd Danial bin Roslan",    "030618-10-4419", "018-667 2299", "Male",   "Demo@1234"),
    ("Chong Kah Wai",             "760131-07-5119", "012-998 5566", "Male",   "Demo@1234"),
    ("Nor Azlina binti Hamid",    "870409-06-5648", "013-221 8899", "Female", "Demo@1234"),
    ("Ganesh s/o Subramaniam",    "930211-10-6437", "016-334 7712", "Male",   "Demo@1234"),
    ("Aina Sofea binti Zulkifli", "051225-14-1288", "011-2233 9944","Female", "Demo@1234"),
]
DIAGNOSES = [
    ("Upper respiratory tract infection", [("Paracetamol 500mg","2 tablets","QID PRN","5 days"),("Cetirizine 10mg","1 tablet","ON","5 days")]),
    ("Acute gastroenteritis", [("Oral Rehydration Salts (ORS)","1 sachet","After each loose stool","3 days"),("Metoclopramide 10mg","1 tablet","TDS","3 days")]),
    ("Hypertension follow-up", [("Amlodipine 5mg","1 tablet","OD","30 days")]),
    ("Type 2 diabetes review", [("Metformin 500mg","1 tablet","BD","30 days")]),
    ("Migraine", [("Ibuprofen 400mg","1 tablet","TDS PRN","3 days")]),
    ("Allergic rhinitis", [("Cetirizine 10mg","1 tablet","ON","7 days")]),
]
COMPLAINTS = [
    ("fever and sore throat since 2 days", "Yellow", "Urgent", 60),
    ("mild cough, no fever", "Green", "Standard", 120),
    ("stomach pain and vomiting since morning", "Yellow", "Urgent", 60),
    ("routine blood pressure check", "Green", "Standard", 120),
    ("headache and dizziness", "Yellow", "Urgent", 60),
    ("skin rash on arms, itchy", "Green", "Standard", 120),
]
VACCINES = [("Influenza (quadrivalent)", "Annual dose"), ("Hepatitis B", "Booster"),
            ("Tetanus (ATT)", "Booster"), ("COVID-19 (bivalent)", "Booster")]

async def get_or_create_user(email, password, name, role, **kw):
    row = await database.fetch_one(users_t.select().where(users_t.c.email == email))
    if row:
        return dict(row)["id"], False
    uid_ = uid()
    await database.execute(users_t.insert().values(
        id=uid_, email=email, password_hash=hash_pw(password), name=name, role=role,
        activated=True, facility_id=FACILITY_ID, source="seed",
        created_at=now_iso(), updated_at=now_iso(), sync_status="local", **kw))
    return uid_, True

async def main():
    await database.connect()
    created = {"doctors": 0, "staff": 0, "patients": 0, "appointments": 0,
               "records": 0, "payments": 0, "vaccinations": 0}
    doctor_ids = []
    for email, pw, name, spec, lic in DOCTORS:
        did, new = await get_or_create_user(email, pw, name, "doctor", specialty=spec, license_no=lic)
        doctor_ids.append(did); created["doctors"] += int(new)
    for email, pw, name, role in STAFF:
        _, new = await get_or_create_user(email, pw, name, role); created["staff"] += int(new)
    existing_doc = await database.fetch_one(users_t.select().where(users_t.c.email == "dr.tan@medilink.io"))
    if existing_doc: doctor_ids.append(dict(existing_doc)["id"])

    for i, (name, ic, phone, gender, pw) in enumerate(PATIENTS):
        existing = await database.fetch_one(users_t.select().where(users_t.c.ic_number == ic))
        if existing:
            pid = dict(existing)["id"]
        else:
            pid, _ = await get_or_create_user(
                f"{ic.replace('-','')}@patient.medilink", pw, name, "patient",
                ic_number=ic, phone=phone, gender=gender,
                dob=f"{'19' if int(ic[:2]) > 30 else '20'}{ic[:2]}-{ic[2:4]}-{ic[4:6]}")
            created["patients"] += 1
        # ~8 of 12 get an appointment today in varied states
        if i < 8:
            existing_appt = await database.fetch_one(
                appointments_t.select().where(
                    (appointments_t.c.patient_id == pid) &
                    (appointments_t.c.scheduled_at.like(now.strftime("%Y-%m-%d") + "%"))))
            if existing_appt:
                continue
            complaint, colour, cat, mins = COMPLAINTS[i % len(COMPLAINTS)]
            status = ["checked_in", "checked_in", "completed", "ready_for_pharmacy",
                      "dispensed", "checked_in", "completed", "dispensed"][i]
            q = await next_q(); aid = uid()
            t = (now - timedelta(minutes=random.randint(10, 300))).isoformat()
            doc = doctor_ids[i % len(doctor_ids)]
            paid = status in ("ready_for_pharmacy", "dispensed")
            await database.execute(appointments_t.insert().values(
                id=aid, patient_id=pid, doctor_id=doc, scheduled_at=t,
                reason=complaint, triage_colour=colour, triage_category=cat,
                triage_target_mins=mins, fee=50.0, status=status, queue_number=q,
                payment_status="paid" if paid else "unpaid",
                payment_method="cash" if paid else None,
                paid_amount=50.0 if paid else None,
                created_at=t, updated_at=t, created_by="kiosk",
                facility_id=FACILITY_ID, source="kiosk", sync_status="local"))
            created["appointments"] += 1
            if status in ("completed", "ready_for_pharmacy", "dispensed"):
                diag, rx = DIAGNOSES[i % len(DIAGNOSES)]
                await database.execute(records_t.insert().values(
                    id=uid(), patient_id=pid, doctor_id=doc, appointment_id=aid,
                    facility_id=FACILITY_ID, diagnosis=diag,
                    notes="Seen and examined. Advised accordingly.",
                    prescriptions=[{"medicine": m, "dosage": d, "frequency": f, "duration": du} for m, d, f, du in rx],
                    vitals={"bp": f"{random.randint(110,135)}/{random.randint(70,88)}",
                            "hr": random.randint(64, 95), "temp": round(random.uniform(36.4, 38.4), 1),
                            "spo2": random.randint(96, 99)},
                    allergies="NKDA", triage_colour=colour, triage_category=cat,
                    attachment_ids=[], created_at=t, updated_at=t, sync_status="local"))
                created["records"] += 1
            if paid:
                await database.execute(payments_t.insert().values(
                    id=uid(), appointment_id=aid, amount=50.0, method="cash",
                    status="succeeded", txn_ref=f"MLK-{uid()[:10].upper()}",
                    paid_by=pid, paid_at=t, facility_id=FACILITY_ID,
                    source="kiosk", sync_status="local"))
                created["payments"] += 1
        # vaccinations for ~half
        if i % 2 == 0:
            existing_vax = await database.fetch_one(
                vaccinations_t.select().where(vaccinations_t.c.patient_id == pid))
            if not existing_vax:
                for v, dose in random.sample(VACCINES, k=2):
                    await database.execute(vaccinations_t.insert().values(
                        id=uid(), patient_id=pid, vaccine=v, dose=dose,
                        batch_no=f"VX-{random.randint(1000,9999)}",
                        administered_by=doctor_ids[0],
                        administered_at=(now - timedelta(days=random.randint(30, 400))).isoformat(),
                        facility_id=FACILITY_ID, sync_status="local"))
                    created["vaccinations"] += 1
    print("SEEDED:", created)
    await database.disconnect()

asyncio.run(main())
