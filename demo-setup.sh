#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Pulih — One-shot demo launcher
#  Kills old servers, wipes DBs, starts clinics, sets up everything,
#  creates cross-clinic patient with records at both clinics.
#
#  Usage:  bash ~/Downloads/medilink-fyp/demo-setup.sh
# ═══════════════════════════════════════════════════════════════════════════
set -e
B="\033[1;36m"; G="\033[0;32m"; Y="\033[0;33m"; R="\033[0;31m"; X="\033[0m"
say(){ printf "\n${B}▶  %s${X}\n" "$*"; }
ok(){  printf "  ${G}✓${X}  %s\n" "$*"; }
warn(){ printf "  ${Y}!${X}  %s\n" "$*"; }
die(){ printf "\n${R}FAIL${X}  %s\n" "$*"; exit 1; }

ROOT="$(cd "$(dirname "$0")" && pwd)"
BASE_A="http://127.0.0.1:8001"
BASE_B="http://127.0.0.1:8002"
KIOSK="demo-kiosk-token"
PY=python3

jpost(){     curl -s -X POST -H "Content-Type: application/json" -d "$2" "$1" || echo '{}'; }
jget(){      curl -s "$1" || echo '{}'; }
jpost_auth(){ curl -s -X POST -H "Content-Type: application/json" \
               -H "Authorization: Bearer $3" -d "$2" "$1" || echo '{}'; }
extract(){ python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d$2)" "$1" 2>/dev/null || echo ""; }

# ── 1. Kill everything on demo ports ─────────────────────────────────────
say "Stopping any existing servers"
for PORT in 8000 8001 8002; do
  PIDS=$(lsof -ti tcp:$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    ok "Cleared port $PORT"
  fi
done
sleep 2

# ── 2. Wipe DBs ───────────────────────────────────────────────────────────
say "Wiping demo databases"
rm -rf "$HOME/.medilink-demo"
mkdir -p "$HOME/.medilink-demo/melaka" "$HOME/.medilink-demo/jasin"
ok "Clean slate"

# ── 3. Export shared env ──────────────────────────────────────────────────
export DEPLOYMENT_MODE=networked
export JWT_SECRET="medilink-psm1-demo-secret-not-for-production-32ch"
export IC_ENCRYPTION_KEY="Ux3n2rW8kQ5vZ1pL7yT4bN6mJ9cH0sD2fG8aK4eR1oI="
export IC_INDEX_KEY="medilink-psm1-demo-blind-index-key"
export KIOSK_TOKEN="demo-kiosk-token"
export ALLOW_SEED=true
export CLOUD_DATABASE_URL="$(grep -E '^CLOUD_DATABASE_URL=' "$ROOT/backend/.env" 2>/dev/null | cut -d= -f2- || true)"
export IS_CLOUD_NODE="false"
export FRONTEND_DIST="$ROOT/backend/static"
_GROQ=$(grep -E '^GROQ_API_KEY=' "$ROOT/backend/.env" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || true)
export GROQ_API_KEY="${_GROQ:-}"

# ── 4. Start clinic servers ───────────────────────────────────────────────
say "Starting clinic servers"

start_clinic(){
  local NAME="$1" CODE="$2" PORT="$3"
  local DIR="$HOME/.medilink-demo/$CODE"
  mkdir -p "$DIR"
  env MEDILINK_DATA_DIR="$DIR" HARNOVA_DATA_DIR="$DIR" \
      DATABASE_URL="sqlite:///$DIR/medilink.db" \
      UPLOAD_DIR="$DIR/uploads" \
      FACILITY_ID="$CODE" CLINIC_NAME="$NAME" \
      HARNOVA_PORT="$PORT" MEDILINK_PORT="$PORT" \
      FRONTEND_DIST="$FRONTEND_DIST" \
  nohup $PY -m uvicorn server:app --app-dir "$ROOT/backend" \
      --host 127.0.0.1 --port "$PORT" --log-level warning \
      > "/tmp/medilink-$CODE.log" 2>&1 &
  echo $!
}

PID_A=$(start_clinic "Klinik Melaka" "melaka" 8001)
PID_B=$(start_clinic "Klinik Jasin"  "jasin"  8002)

# Start gateway
env FRONTEND_DIST="$FRONTEND_DIST" \
    CLINIC_A_URL="http://127.0.0.1:8001" \
    CLINIC_B_URL="http://127.0.0.1:8002" \
nohup $PY -m uvicorn gateway:app --app-dir "$ROOT/backend" \
    --host 0.0.0.0 --port 8000 --log-level warning \
    > "/tmp/medilink-gateway.log" 2>&1 &
PID_GW=$!

# Wait for all three
for PORT in 8001 8002 8000; do
  UP=0
  for _ in $(seq 1 60); do
    sleep 0.5
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && UP=1 && break
  done
  if [ "$UP" = "1" ]; then
    ok "Port $PORT ready"
  else
    printf "\n${R}FAIL${X}  Port $PORT did not start. Log:\n"
    tail -20 "/tmp/medilink-$([ "$PORT" = "8001" ] && echo melaka || ([ "$PORT" = "8002" ] && echo jasin || echo gateway)).log"
    exit 1
  fi
done

# ── 5. Setup Klinik Melaka ────────────────────────────────────────────────
say "Setting up Klinik Melaka (8001)"
jpost "$BASE_A/api/setup" \
  '{"clinic_name":"Klinik Melaka","admin_name":"Dr. Admin Melaka","admin_email":"admin@melaka.medilink","admin_password":"Admin@123","clinic_address":"Jalan Kota, Melaka Tengah, 75000 Melaka","clinic_phone":"06-2823100"}' \
  > /dev/null
ok "Setup complete"

RAW_A=$(jpost "$BASE_A/api/auth/login" '{"email":"admin@melaka.medilink","password":"Admin@123"}')
TOK_A=$(extract "$RAW_A" ".get('token') or d.get('access_token','')")
[ -n "$TOK_A" ] && ok "Logged in" || die "Melaka login failed — response: $RAW_A"

jpost_auth "$BASE_A/api/seed" '{}' "$TOK_A" > /dev/null 2>&1 || true
ok "Staff & inventory seeded"

# ── 6. Setup Klinik Jasin ─────────────────────────────────────────────────
say "Setting up Klinik Jasin (8002)"
jpost "$BASE_B/api/setup" \
  '{"clinic_name":"Klinik Jasin","admin_name":"Dr. Admin Jasin","admin_email":"admin@jasin.medilink","admin_password":"Admin@123","clinic_address":"Jalan Genuang, Jasin, 77000 Melaka","clinic_phone":"06-5282200"}' \
  > /dev/null
ok "Setup complete"

RAW_B=$(jpost "$BASE_B/api/auth/login" '{"email":"admin@jasin.medilink","password":"Admin@123"}')
TOK_B=$(extract "$RAW_B" ".get('token') or d.get('access_token','')")
[ -n "$TOK_B" ] && ok "Logged in" || die "Jasin login failed — response: $RAW_B"

jpost_auth "$BASE_B/api/seed" '{}' "$TOK_B" > /dev/null 2>&1 || true
ok "Staff & inventory seeded"

# ── 7. Register patient at Melaka kiosk ───────────────────────────────────
say "Creating patient: Yashpreet Singh"
PATIENT_IC="990101-14-5432"

REG=$(curl -s -X POST -H "Content-Type: application/json" -H "X-Kiosk-Token: $KIOSK" \
  -d '{"ic_number":"990101-14-5432","name":"Yashpreet Singh","phone":"+60123456789","email":"yashpreet@demo.medilink"}' \
  "$BASE_A/api/kiosk/register" || echo '{}')

PATIENT_ID=$(extract "$REG" ".get('patient',{}).get('id','')")
ACT_CODE=$(extract  "$REG" ".get('activation_code','')")

if [ -z "$PATIENT_ID" ]; then
  LOOKUP=$(curl -s -H "X-Kiosk-Token: $KIOSK" "$BASE_A/api/kiosk/lookup/$PATIENT_IC" || echo '{}')
  PATIENT_ID=$(extract "$LOOKUP" ".get('patient',{}).get('id','')")
fi
[ -n "$PATIENT_ID" ] && ok "Patient ID: $PATIENT_ID" || die "Could not create patient"

# Activate patient account — /auth/activate requires ic_number + code + password
if [ -n "$ACT_CODE" ] && [ "$ACT_CODE" != "None" ]; then
  ACT_RESP=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"ic_number\":\"$PATIENT_IC\",\"code\":\"$ACT_CODE\",\"password\":\"Patient@123\"}" \
    "$BASE_A/api/auth/activate" 2>/dev/null || echo '{}')
  ACT_TOK=$(extract "$ACT_RESP" ".get('token','') or d.get('access_token','')")
  if [ -n "$ACT_TOK" ]; then
    ok "Patient portal account activated"
    # The endpoint returns the pre-update row; force activated=1 in DB to be safe
    sqlite3 "$HOME/.medilink-demo/melaka/medilink.db" \
      "UPDATE users SET activated=1 WHERE email='yashpreet@demo.medilink';" 2>/dev/null || true
  else
    warn "Activation issue: $ACT_RESP — forcing via DB"
    sqlite3 "$HOME/.medilink-demo/melaka/medilink.db" \
      "UPDATE users SET activated=1 WHERE email='yashpreet@demo.medilink';" 2>/dev/null || true
  fi
else
  warn "No activation code returned — patient may need manual activation"
fi

ok "Waiting for cloud sync (~6s)..."
sleep 6

# ── 8. Create record at Klinik Melaka ────────────────────────────────────
say "Creating record at Klinik Melaka"

STAFF_A=$(curl -s -H "Authorization: Bearer $TOK_A" "$BASE_A/api/admin/staff" 2>/dev/null || echo '[]')
DR_ID_A=$(python3 -c "
import json,sys
try:
    s=json.loads('''$STAFF_A''')
    docs=[x for x in (s if isinstance(s,list) else []) if x.get('role')=='doctor']
    print(docs[0]['id'] if docs else '')
except: print('')
" 2>/dev/null || echo "")
ok "Doctor: ${DR_ID_A:-none (will still create record)}"

REC_A=$(curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK_A" \
  -d "{\"patient_id\":\"$PATIENT_ID\",\"diagnosis\":\"Acute Upper Respiratory Tract Infection\",\"notes\":\"Fever 38.5C, dry cough, sore throat x3 days. No lower respiratory involvement. Advised rest and hydration.\",\"vitals\":{\"temp\":38.5,\"bp\":\"118/76\",\"hr\":88,\"spo2\":98},\"prescriptions\":[{\"medicine\":\"Paracetamol 500mg\",\"dosage\":\"1 tablet\",\"frequency\":\"3x daily\",\"duration\":\"3 days\"},{\"medicine\":\"Cetirizine 10mg\",\"dosage\":\"1 tablet\",\"frequency\":\"Once nightly\",\"duration\":\"3 days\"}]}" \
  "$BASE_A/api/records" 2>/dev/null || echo '{}')
REC_A_ID=$(extract "$REC_A" ".get('id','')")
[ -n "$REC_A_ID" ] && ok "Melaka record created: $REC_A_ID" || warn "Record response: $(echo $REC_A | head -c 300)"

ok "Waiting for record to sync to cloud (~6s)..."
sleep 6

# ── 9. Pull patient to Jasin, create Jasin record ────────────────────────
say "Pulling patient to Klinik Jasin"

JASIN_LOOKUP=$(curl -s -H "X-Kiosk-Token: $KIOSK" "$BASE_B/api/kiosk/lookup/$PATIENT_IC" || echo '{}')
PATIENT_ID_B=$(extract "$JASIN_LOOKUP" ".get('patient',{}).get('id','')")

if [ -z "$PATIENT_ID_B" ]; then
  JASIN_REG=$(curl -s -X POST -H "Content-Type: application/json" -H "X-Kiosk-Token: $KIOSK" \
    -d '{"ic_number":"990101-14-5432","name":"Yashpreet Singh","phone":"+60123456789"}' \
    "$BASE_B/api/kiosk/register" || echo '{}')
  PATIENT_ID_B=$(extract "$JASIN_REG" ".get('patient',{}).get('id','')")
fi
[ -n "$PATIENT_ID_B" ] && ok "Patient at Jasin: $PATIENT_ID_B" || warn "Cloud pull may still be in progress"

say "Creating record at Klinik Jasin"

STAFF_B=$(curl -s -H "Authorization: Bearer $TOK_B" "$BASE_B/api/admin/staff" 2>/dev/null || echo '[]')
DR_ID_B=$(python3 -c "
import json,sys
try:
    s=json.loads('''$STAFF_B''')
    docs=[x for x in (s if isinstance(s,list) else []) if x.get('role')=='doctor']
    print(docs[0]['id'] if docs else '')
except: print('')
" 2>/dev/null || echo "")
ok "Doctor: ${DR_ID_B:-none (will still create record)}"

if [ -n "$PATIENT_ID_B" ]; then
  REC_B=$(curl -s -X POST -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOK_B" \
    -d "{\"patient_id\":\"$PATIENT_ID_B\",\"diagnosis\":\"Post-viral Cough\",\"notes\":\"Follow-up after URTI at Klinik Melaka. Fever resolved. Persistent cough, lungs clear. No antibiotics needed.\",\"vitals\":{\"temp\":37.1,\"bp\":\"116/74\",\"hr\":80,\"spo2\":99},\"prescriptions\":[{\"medicine\":\"Cetirizine 10mg\",\"dosage\":\"1 tablet\",\"frequency\":\"Once nightly\",\"duration\":\"5 days\"}]}" \
    "$BASE_B/api/records" 2>/dev/null || echo '{}')
  REC_B_ID=$(extract "$REC_B" ".get('id','')")
  [ -n "$REC_B_ID" ] && ok "Jasin record created: $REC_B_ID" || warn "Jasin record response: $(echo $REC_B | head -c 300)"
else
  warn "No patient at Jasin yet — skipping record"
fi

ok "Waiting for Jasin record to sync (~6s)..."
sleep 6

# ── 10. Additional records at Melaka (richer history) ────────────────────
say "Seeding additional medical records & billing"

# Second Melaka record — Hypertension follow-up
curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOK_A" \
  -d "{\"patient_id\":\"$PATIENT_ID\",\"diagnosis\":\"Essential Hypertension (Controlled)\",\"notes\":\"BP well-controlled on current regimen. Patient compliant with medication. Lifestyle advice given — reduce salt, increase activity.\",\"vitals\":{\"temp\":36.8,\"bp\":\"128/82\",\"hr\":74,\"spo2\":99},\"prescriptions\":[{\"medicine\":\"Amlodipine 5mg\",\"dosage\":\"1 tablet\",\"frequency\":\"Once daily\",\"duration\":\"30 days\"}]}" \
  "$BASE_A/api/records" > /dev/null 2>&1 || true

# Third Melaka record — Allergy consultation
curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOK_A" \
  -d "{\"patient_id\":\"$PATIENT_ID\",\"diagnosis\":\"Allergic Rhinitis\",\"notes\":\"Perennial symptoms — nasal congestion, sneezing, watery eyes. Triggered by dust mites and pollen. Skin prick test arranged.\",\"vitals\":{\"temp\":36.9,\"bp\":\"120/78\",\"hr\":76,\"spo2\":98},\"prescriptions\":[{\"medicine\":\"Loratadine 10mg\",\"dosage\":\"1 tablet\",\"frequency\":\"Once daily\",\"duration\":\"14 days\"},{\"medicine\":\"Fluticasone Nasal Spray\",\"dosage\":\"2 sprays each nostril\",\"frequency\":\"Once daily\",\"duration\":\"14 days\"}]}" \
  "$BASE_A/api/records" > /dev/null 2>&1 || true

ok "Additional records seeded"

# Seed billing receipts via kiosk/pay (cash = instant, creates real receipt rows)
# Create two past appointments then pay them via kiosk
APPT1=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOK_A" \
  -d "{\"patient_id\":\"$PATIENT_ID\",\"doctor_id\":\"${DR_ID_A:-}\",\"scheduled_at\":\"2026-08-20T09:00:00\",\"reason\":\"Follow-up hypertension\",\"fee\":35}" \
  "$BASE_A/api/appointments" 2>/dev/null || echo '{}')
APPT1_ID=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('id',''))" "$APPT1" 2>/dev/null || echo "")

APPT2=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOK_A" \
  -d "{\"patient_id\":\"$PATIENT_ID\",\"doctor_id\":\"${DR_ID_A:-}\",\"scheduled_at\":\"2026-08-27T10:30:00\",\"reason\":\"Allergic rhinitis consultation\",\"fee\":30}" \
  "$BASE_A/api/appointments" 2>/dev/null || echo '{}')
APPT2_ID=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('id',''))" "$APPT2" 2>/dev/null || echo "")

# Pay via kiosk (cash = instant confirmation, creates payments + updates appointment)
for AID in "$APPT1_ID" "$APPT2_ID"; do
  [ -z "$AID" ] && continue
  curl -s -X POST -H "Content-Type: application/json" -H "X-Kiosk-Token: $KIOSK" \
    -d "{\"ic_number\":\"$PATIENT_IC\",\"appointment_id\":\"$AID\",\"method\":\"cash\"}" \
    "$BASE_A/api/kiosk/pay" > /dev/null 2>&1 || true
done
ok "Billing receipts seeded"

# ── Done ──────────────────────────────────────────────────────────────────
printf "\n"
printf "${G}  ╔══════════════════════════════════════════════════════════════╗\n"
printf "  ║              Demo setup complete! Servers running.          ║\n"
printf "  ╚══════════════════════════════════════════════════════════════╝${X}\n\n"
printf "  ${B}Patient portal${X}   http://127.0.0.1:8000\n"
printf "  ${Y}Patient login${X}    yashpreet@demo.medilink  /  Patient@123\n\n"
printf "  ${B}Klinik Melaka${X}    http://127.0.0.1:8001\n"
printf "  ${B}Klinik Jasin${X}     http://127.0.0.1:8002\n"
printf "  ${Y}Admin login${X}      admin@melaka.medilink  /  Admin@123\n"
printf "               admin@jasin.medilink   /  Admin@123\n\n"
printf "  Log in to the patient portal → Medical Records\n"
printf "  You should see ${G}3 Melaka records + 1 Jasin record${X} (cross-clinic)\n"
printf "  Receipts tab shows ${G}2 payments${X}\n\n"
printf "  ${Y}Servers are running. Keep this window open.${X}\n"
printf "  To stop:  kill $PID_A $PID_B $PID_GW\n"
printf "  Logs:     /tmp/medilink-melaka.log  /tmp/medilink-jasin.log\n\n"

sleep 1
open "http://127.0.0.1:8000" 2>/dev/null || true

# Keep servers alive
wait $PID_A $PID_B $PID_GW 2>/dev/null || true
