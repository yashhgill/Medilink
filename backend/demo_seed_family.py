"""
Seed rich demo data for two patients and mirror it to the cloud.

  Nehapreet Kaur        — female, chronic (diabetes + anaemia) story
  Hashpreet Singh Gill  — male, injury + follow-up story

Each patient gets multiple visits split across BOTH clinics
(klinik-melaka = Clinic A, klinik-sunway = Clinic B), full medical records,
resulted blood panels (some flagged ABNORMAL), a real X-ray image attachment,
and paid payment records.

Run inside the backend container (Clinic A):
    docker compose exec -T backend python demo_seed_family.py

It writes to the LOCAL db, generates real X-ray PNGs (mirrored to S3 if
configured), enqueues everything, then pushes it all to the CLOUD mirror — so
the data is present both offline (local) and online (cloud / other clinic).

Idempotent: re-running skips patients/visits that already exist by a stable key.
"""
import asyncio, os, io, math, random
from datetime import datetime, timezone, timedelta

from server import (database, cloud_db, users_t, appointments_t, records_t,
                    payments_t, lab_orders_t, attachments_t, vaccinations_t,
                    facilities_t, dispense_t, inventory_t,
                    ic_store, ic_index, hash_pw, uid, now_iso, next_q,
                    UPLOAD_DIR, S3_BUCKET, s3, IS_CLOUD)

random.seed(42)
now = datetime.now(timezone.utc)

CLINIC_A = "klinik-melaka"   # Clinic A
CLINIC_B = "klinik-sunway"   # Clinic B

# ── People ────────────────────────────────────────────────────────────────────
# (name, ic, phone, gender, dob, password)
# These two patients ALREADY EXIST. We attach data to their existing accounts and
# NEVER change their credentials — the password below is only used if, and only
# if, the account does not exist yet (fresh create).
FAMILY = [
    ("Nehapreet Kaur Gill", "030305-14-0854", "012-373 6797", "Female", "2003-03-05", "Demo@1234"),
    ("Hashpreet Singh Gill","050422-10-1707", "011-2884 3390","Male",   "2005-04-22", "Demo@1234"),
]

DOCTORS = [
    # email, name, specialty, license, facility
    ("dr.aisyah@medilink.io", "Dr. Nur Aisyah binti Rahman", "Family Medicine",   "MMC-61204", CLINIC_A),
    ("dr.kumar@medilink.io",  "Dr. Rajesh Kumar",            "Internal Medicine", "MMC-58317", CLINIC_B),
]

# ── Blood panels (name, code, unit, ref_range, normal_fn, abnormal_value) ──────
def _fbc(abnormal):
    # anaemia picture when abnormal
    return [
        ("Haemoglobin",       "HB",   "g/dL",   "12.0–15.5", "10.4" if abnormal else "13.6", abnormal),
        ("White Cell Count",  "WBC",  "10^9/L", "4.0–11.0",  "7.2", False),
        ("Platelets",         "PLT",  "10^9/L", "150–410",   "268", False),
        ("Haematocrit",       "HCT",  "%",      "36–46",     "33.1" if abnormal else "41.2", abnormal),
    ]

def _lipid(abnormal):
    return [
        ("Total Cholesterol", "CHOL", "mmol/L", "< 5.2",  "6.4" if abnormal else "4.6", abnormal),
        ("LDL Cholesterol",   "LDL",  "mmol/L", "< 3.4",  "4.3" if abnormal else "2.7", abnormal),
        ("HDL Cholesterol",   "HDL",  "mmol/L", "> 1.0",  "1.3", False),
        ("Triglycerides",     "TG",   "mmol/L", "< 1.7",  "2.2" if abnormal else "1.2", abnormal),
    ]

def _hba1c(abnormal):
    return [("HbA1c", "HBA1C", "%", "< 5.7", "7.8" if abnormal else "5.4", abnormal)]

def _rft(abnormal):
    return [
        ("Urea",       "UREA", "mmol/L", "2.5–7.1",  "5.1", False),
        ("Creatinine", "CREA", "umol/L", "62–106",   "88",  False),
        ("Sodium",     "NA",   "mmol/L", "135–145",  "139", False),
        ("Potassium",  "K",    "mmol/L", "3.5–5.1",  "4.2", False),
    ]

# ── Visit plans ────────────────────────────────────────────────────────────────
# each visit: (facility, days_ago, complaint, colour, cat, target, diagnosis,
#              prescriptions, vitals_over, panels, xray_kind_or_None)
def plan_for(idx):
    if idx == 0:  # Nehapreet — diabetes + anaemia journey
        return [
            (CLINIC_A, 96, "routine check-up, feeling tired", "Green", "Standard", 120,
             "Iron-deficiency anaemia; Type 2 diabetes review",
             [("Ferrous Fumarate 200mg","1 tablet","BD","30 days"),
              ("Metformin 500mg","1 tablet","BD","30 days")],
             {"bp":"128/82","hr":88,"temp":36.8,"spo2":98},
             _fbc(True)+_hba1c(True), None),
            (CLINIC_A, 64, "diabetes follow-up", "Green", "Standard", 120,
             "Type 2 diabetes — improving control",
             [("Metformin 500mg","1 tablet","BD","30 days")],
             {"bp":"124/80","hr":82,"temp":36.6,"spo2":99},
             _hba1c(False)+_lipid(True), None),
            (CLINIC_B, 21, "dizziness and palpitations", "Yellow", "Urgent", 60,
             "Symptomatic anaemia — under review",
             [("Ferrous Fumarate 200mg","1 tablet","BD","60 days"),
              ("Folic Acid 5mg","1 tablet","OD","60 days")],
             {"bp":"118/76","hr":96,"temp":36.7,"spo2":97},
             _fbc(True)+_rft(False), "chest"),
        ]
    else:  # Hashpreet — sports injury + recovery
        return [
            (CLINIC_A, 40, "fell during football, right wrist pain and swelling",
             "Yellow", "Urgent", 60,
             "Suspected right distal radius fracture",
             [("Ibuprofen 400mg","1 tablet","TDS PRN","5 days"),
              ("Paracetamol 500mg","2 tablets","QID PRN","5 days")],
             {"bp":"126/78","hr":90,"temp":36.9,"spo2":99},
             _fbc(False), "wrist"),
            (CLINIC_B, 12, "wrist follow-up, cast review", "Green", "Standard", 120,
             "Healing distal radius fracture — cast intact",
             [("Paracetamol 500mg","2 tablets","QID PRN","5 days"),
              ("Calcium + Vitamin D3","1 tablet","OD","30 days")],
             {"bp":"122/76","hr":78,"temp":36.6,"spo2":99},
             _rft(False), "wrist"),
            (CLINIC_B, 3, "mild fever and cough", "Green", "Standard", 120,
             "Upper respiratory tract infection",
             [("Cetirizine 10mg","1 tablet","ON","5 days"),
              ("Paracetamol 500mg","2 tablets","QID PRN","3 days")],
             {"bp":"120/74","hr":84,"temp":37.8,"spo2":98},
             _fbc(False)+_lipid(False), None),
        ]

VACCINES = [("Influenza (quadrivalent)","Annual dose"),("Hepatitis B","Booster"),
            ("Tetanus (ATT)","Booster"),("COVID-19 (bivalent)","Booster")]


# ── Synthetic X-ray image (real PNG bytes) ─────────────────────────────────────
def make_xray_png(kind: str) -> bytes:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    W, H = 760, 900
    img = Image.new("L", (W, H), 8)
    d = ImageDraw.Draw(img)
    if kind == "chest":
        # thorax silhouette + ribs + spine + lung fields
        d.ellipse([120, 120, 640, 820], fill=42)
        d.ellipse([170, 190, 380, 720], fill=20)   # left lung
        d.ellipse([390, 190, 600, 720], fill=20)   # right lung
        for i in range(9):                          # rib arcs
            y = 210 + i*58
            d.arc([150, y-40, 400, y+120], start=200, end=340, fill=150, width=4)
            d.arc([380, y-40, 630, y+120], start=200, end=340, fill=150, width=4)
        d.rectangle([372, 150, 408, 800], fill=110) # spine
        for y in range(160, 800, 46):               # vertebrae
            d.rectangle([366, y, 414, y+30], outline=180, width=2)
        d.polygon([(300,760),(480,760),(390,560)], fill=70)  # heart shadow
    else:  # wrist / forearm
        d.rounded_rectangle([300, 60, 470, 520], radius=40, fill=170)   # radius
        d.rounded_rectangle([250, 90, 330, 520], radius=40, fill=150)   # ulna
        # carpal bones
        for cx, cy in [(320,560),(380,570),(300,610),(360,620),(410,600),(340,660)]:
            d.ellipse([cx-26, cy-22, cx+26, cy+22], fill=180)
        # metacarpals / fingers
        for i, x in enumerate(range(280, 470, 44)):
            d.rounded_rectangle([x, 690, x+22, 850], radius=10, fill=165)
        # a hairline fracture line across the radius
        d.line([(300,300),(470,330)], fill=250, width=3)
    img = img.filter(ImageFilter.GaussianBlur(1.1))
    # faint annotation
    d2 = ImageDraw.Draw(img)
    try:
        f = ImageFont.load_default()
        d2.text((20, 20), f"MEDILINK PACS  |  {kind.upper()}  |  DEMO", fill=210, font=f)
        d2.text((20, H-30), "Not for clinical use — synthetic demo image", fill=150, font=f)
    except Exception:
        pass
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def get_or_create_doctor(email, name, spec, lic, fac):
    row = await database.fetch_one(users_t.select().where(users_t.c.email == email))
    if row:
        return dict(row)["id"]
    did = uid()
    await database.execute(users_t.insert().values(
        id=did, email=email, password_hash=hash_pw("Doctor@123"), name=name,
        role="doctor", activated=True, specialty=spec, license_no=lic,
        facility_id=fac, source="seed", created_at=now_iso(), updated_at=now_iso(),
        sync_status="local"))
    return did


async def _mirror_user_to_local(pid):
    """If the patient exists ONLY in the cloud, copy that exact row (same id,
    same password_hash, same ic_hash) into the local DB so the two nodes share
    one identity. Credentials are copied verbatim — never regenerated."""
    if not cloud_db:
        return
    cu = await cloud_db.fetch_one(users_t.select().where(users_t.c.id == pid))
    loc = await database.fetch_one(users_t.select().where(users_t.c.id == pid))
    if cu and not loc:
        d = dict(cu)
        await database.execute(users_t.insert().values(**d))


async def get_or_create_patient(name, ic, phone, gender, dob, pw):
    """Attach to the EXISTING patient account for this IC. Credentials of the real
    account (password + IC) are left completely untouched.

    Priority for the canonical id:
      1. CLOUD account — because the patient portal (which reads cloud RDS)
         resolves login by ic_hash and returns the cloud id. Records must live
         under THAT id or the portal shows nothing. We mirror the cloud identity
         down to local (verbatim) and clear only a stale local drift-duplicate.
      2. LOCAL account — if the patient exists only locally; it gets pushed up.
      3. Fresh create — if the account exists on neither node.
    """
    ich = ic_index(ic)
    cu = await cloud_db.fetch_one(users_t.select().where(users_t.c.ic_hash == ich)) if cloud_db else None
    loc = await database.fetch_one(users_t.select().where(users_t.c.ic_hash == ich))

    if cu:
        pid = dict(cu)["id"]
        # Remove a stale local duplicate under a DIFFERENT id (drift artifact),
        # so the local clinic view and the portal agree. The real account (cloud)
        # is preserved; nothing about its login changes.
        if loc and dict(loc)["id"] != pid:
            await database.execute(users_t.delete().where(users_t.c.id == dict(loc)["id"]))
            loc = None
        await _mirror_user_to_local(pid)       # copy cloud identity down, untouched
        return pid, False

    if loc:
        return dict(loc)["id"], False          # local-only account — leave as-is

    # Truly new — create it (the password below is only used in this fresh case)
    pid = uid()
    await database.execute(users_t.insert().values(
        id=pid, email=f"{ic.replace('-','')}@patient.medilink", password_hash=hash_pw(pw),
        name=name, role="patient", activated=True, ic_number=ic_store(ic),
        ic_hash=ich, phone=phone, gender=gender, dob=dob,
        facility_id=CLINIC_A, source="seed", created_at=now_iso(), updated_at=now_iso(),
        sync_status="local"))
    return pid, True


async def main():
    await database.connect()
    if cloud_db and not IS_CLOUD:
        await cloud_db.connect()

    made = {"patients":0,"visits":0,"records":0,"labs":0,"xrays":0,"payments":0,"vax":0}
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    docs = {}
    for email, name, spec, lic, fac in DOCTORS:
        docs[fac] = await get_or_create_doctor(email, name, spec, lic, fac)

    seeded = []   # (name, ic, pid) for the verification pass
    for idx, (name, ic, phone, gender, dob, pw) in enumerate(FAMILY):
        pid, is_new = await get_or_create_patient(name, ic, phone, gender, dob, pw)
        made["patients"] += int(is_new)
        seeded.append((name, ic, pid))

        for vi, (fac, days_ago, complaint, colour, cat, target, diag, rx, vit, panels, xray) \
                in enumerate(plan_for(idx)):
            t = (now - timedelta(days=days_ago, minutes=random.randint(5, 300))).isoformat()
            # stable idempotency key: same patient + same scheduled minute
            slot = t[:16]
            dup = await database.fetch_one(appointments_t.select().where(
                (appointments_t.c.patient_id == pid) &
                (appointments_t.c.scheduled_at.like(slot + "%"))))
            if dup:
                continue
            doc = docs.get(fac) or list(docs.values())[0]
            q = await next_q()
            aid = uid()
            await database.execute(appointments_t.insert().values(
                id=aid, patient_id=pid, doctor_id=doc, scheduled_at=t, reason=complaint,
                triage_colour=colour, triage_category=cat, triage_target_mins=target,
                fee=50.0, status="dispensed", queue_number=q,
                payment_status="paid", payment_method="cash", paid_amount=50.0,
                created_at=t, updated_at=t, created_by="kiosk",
                facility_id=fac, source="kiosk", sync_status="local"))
            made["visits"] += 1

            rec_id = uid()
            att_ids = []

            # X-ray attachment (real PNG on disk + S3 mirror)
            if xray:
                png = make_xray_png(xray)
                att_id = uid()
                fname = f"{xray}_xray_{slot[:10]}.png"
                path = os.path.join(UPLOAD_DIR, f"{att_id}_{fname}")
                with open(path, "wb") as fh:
                    fh.write(png)
                stored_path = path
                cli = s3()
                if cli and S3_BUCKET:
                    try:
                        key = f"{fac}/{pid}/{att_id}_{fname}"
                        cli.put_object(Bucket=S3_BUCKET, Key=key, Body=png, ContentType="image/png")
                        stored_path = f"s3://{S3_BUCKET}/{key}"
                    except Exception as e:
                        print("S3 mirror skipped:", e)
                await database.execute(attachments_t.insert().values(
                    id=att_id, record_id=rec_id, patient_id=pid, filename=fname,
                    content_type="image/png", size_bytes=len(png), path=stored_path,
                    uploaded_by=doc, created_at=t, facility_id=fac, sync_status="local"))
                att_ids.append(att_id)
                made["xrays"] += 1

            await database.execute(records_t.insert().values(
                id=rec_id, patient_id=pid, doctor_id=doc, appointment_id=aid,
                facility_id=fac, diagnosis=diag,
                notes="Seen and examined. History and vitals reviewed; investigations ordered.",
                prescriptions=[{"medicine":m,"dosage":d,"frequency":f,"duration":du} for m,d,f,du in rx],
                vitals=vit, allergies="NKDA", triage_colour=colour, triage_category=cat,
                attachment_ids=att_ids, created_at=t, updated_at=t, sync_status="local"))
            made["records"] += 1

            # blood panels -> lab_orders (resulted)
            for tname, code, unit, ref, val, abn in panels:
                await database.execute(lab_orders_t.insert().values(
                    id=uid(), patient_id=pid, doctor_id=doc, record_id=rec_id,
                    test_name=tname, test_code=code, status="resulted",
                    result_value=val, result_unit=unit, ref_range=ref, abnormal=bool(abn),
                    notes="", ordered_at=t, resulted_at=t, facility_id=fac,
                    sync_status="local"))
                made["labs"] += 1

            # payment
            await database.execute(payments_t.insert().values(
                id=uid(), appointment_id=aid, amount=50.0, method="cash",
                status="succeeded", txn_ref=f"MLK-{uid()[:10].upper()}",
                paid_by=pid, paid_at=t, facility_id=fac, source="kiosk", sync_status="local"))
            made["payments"] += 1

        # a couple of vaccinations each
        has_vax = await database.fetch_one(vaccinations_t.select().where(vaccinations_t.c.patient_id == pid))
        if not has_vax:
            for v, dose in random.sample(VACCINES, k=2):
                await database.execute(vaccinations_t.insert().values(
                    id=uid(), patient_id=pid, vaccine=v, dose=dose,
                    batch_no=f"VX-{random.randint(1000,9999)}",
                    administered_by=list(docs.values())[0],
                    administered_at=(now - timedelta(days=random.randint(60, 500))).isoformat(),
                    facility_id=CLINIC_A, sync_status="local"))
                made["vax"] += 1

    print("SEEDED (local):", made)

    # ── Push everything to the cloud mirror (both offline + online) ───────────
    if cloud_db and not IS_CLOUD:
        tables = {"users": users_t, "appointments": appointments_t,
                  "medical_records": records_t, "payments": payments_t,
                  "vaccinations": vaccinations_t, "attachments": attachments_t,
                  "lab_orders": lab_orders_t}
        pushed = {}
        for nm, tbl in tables.items():
            n = 0
            for r in await database.fetch_all(tbl.select()):
                d = dict(r)
                try:
                    ex = await cloud_db.fetch_one(tbl.select().where(tbl.c.id == d["id"]))
                    if ex:
                        await cloud_db.execute(tbl.update().where(tbl.c.id == d["id"])
                            .values(**{k:v for k,v in d.items() if k != "id"}))
                    else:
                        await cloud_db.execute(tbl.insert().values(**d))
                    if "sync_status" in d:
                        await database.execute(tbl.update().where(tbl.c.id == d["id"])
                            .values(sync_status="cloud"))
                    n += 1
                except Exception as e:
                    print(f"cloud push {nm}:{d.get('id')} failed:", e)
            pushed[nm] = n
        print("PUSHED (cloud):", pushed)
    else:
        print("No cloud mirror on this node — local only.")

    # ── Self-verify: prove the data is visible where the app reads it ─────────
    async def counts(db, pid):
        if db is None:
            return None
        r = await db.fetch_val("SELECT COUNT(*) FROM medical_records WHERE patient_id = :p", {"p": pid})
        p = await db.fetch_val("SELECT COUNT(*) FROM payments WHERE paid_by = :p", {"p": pid})
        l = await db.fetch_val("SELECT COUNT(*) FROM lab_orders WHERE patient_id = :p", {"p": pid})
        a = await db.fetch_val("SELECT COUNT(*) FROM attachments WHERE patient_id = :p", {"p": pid})
        return {"records": r or 0, "payments": p or 0, "labs": l or 0, "xrays": a or 0}

    print("\n===== VERIFICATION (what the app will see) =====")
    all_ok = True
    for name, ic, pid in seeded:
        loc = await counts(database, pid)
        cld = await counts(cloud_db, pid) if (cloud_db and not IS_CLOUD) else None
        print(f"\n{name}  (IC {ic})")
        print(f"  login id : {pid}")
        print(f"  LOCAL    : {loc}")
        if cld is not None:
            print(f"  CLOUD    : {cld}")
            if (cld["records"] == 0 or cld["payments"] == 0):
                all_ok = False
        if loc["records"] == 0:
            all_ok = False
    print("\n" + ("ALL GOOD — records + receipts present locally"
                  + (" and in the cloud portal." if (cloud_db and not IS_CLOUD) else ".")
                  if all_ok else
                  "WARNING — something is still empty; see counts above."))

    if cloud_db and not IS_CLOUD:
        await cloud_db.disconnect()
    await database.disconnect()
    print("DONE.")

asyncio.run(main())
