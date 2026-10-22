#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  MediLink — client demonstration
#
#  Double-click this file. It starts one clinic, Klinik Melaka, with a
#  realistic day already under way (patients waiting, seen, paid, at the
#  pharmacy), and opens it in your browser. Every launch starts a fresh day,
#  so the queue is always "today" and nothing from the last demo is left over.
#
#  Runs entirely on this Mac. No internet or cloud database needed.
#  Close this window (or press Ctrl+C) to stop.
# ═══════════════════════════════════════════════════════════════════════════
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$HOME/.medilink-client-demo"
VENV="$HOME_DIR/venv"
DATA="$HOME_DIR/klinik-melaka"
PORT=8001
LOG="$HOME_DIR/server.log"
PID=0

B="\033[1;36m"; G="\033[0;32m"; Y="\033[0;33m"; R="\033[0;31m"; D="\033[2m"; X="\033[0m"
say(){ printf "\n${B}%s${X}\n" "$*"; }
ok(){  printf "  ${G}OK${X}   %s\n" "$*"; }
bad(){ printf "  ${R}FAIL${X} %s\n" "$*"; }
die(){ bad "$*"; printf "\n"; read -r -p "  Press Return to close…" _; exit 1; }
cleanup(){ [ "$PID" != "0" ] && kill "$PID" 2>/dev/null; wait 2>/dev/null; printf "\n  MediLink stopped.\n"; }
trap cleanup EXIT INT TERM

mkdir -p "$HOME_DIR"
say "MediLink client demo"

# ── 1. Python environment (one time, about a minute) ────────────────────────
say "1. Preparing Python"
PY="${MEDILINK_PYTHON:-}"
[ -n "$PY" ] || for c in python3.13 python3.12 python3.11 /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 \
         "$HOME/.homebrew/bin/python3.13" "$HOME/.homebrew/bin/python3.12" python3; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
[ -n "$PY" ] || die "Python 3 is not installed. Install it from python.org and try again."
if [ ! -x "$VENV/bin/python" ]; then
  "$PY" -m venv "$VENV" || die "could not create the Python environment"
fi
if ! "$VENV/bin/python" -c "import sqlalchemy.sql.compiler, fastapi, uvicorn, websockets, databases, aiosqlite, jwt, bcrypt, fpdf, qrcode, cryptography, email_validator, multipart" 2>/dev/null; then
  printf "  installing packages (one time)…\n"
  "$VENV/bin/python" -m pip install --quiet --upgrade pip
  "$VENV/bin/python" -m pip install --quiet \
    "fastapi==0.110.1" "uvicorn[standard]==0.25.0" "databases[aiosqlite]==0.9.0" aiosqlite \
    "sqlalchemy>=2.0.43" "pydantic[email]>=2.12" python-dotenv "pyjwt>=2.10.1" "bcrypt==4.1.3" \
    passlib python-multipart httpx "qrcode[pil]" Pillow fpdf2 cryptography groq tzdata \
    || die "package install failed (check the internet connection for this one-time step)"
fi
ok "Python ready ($("$VENV/bin/python" --version))"

# ── 2. Interface ─────────────────────────────────────────────────────────────
say "2. Interface"
if [ -f "$ROOT/frontend/build/index.html" ]; then
  rm -rf "$ROOT/backend/static" && cp -R "$ROOT/frontend/build" "$ROOT/backend/static"
fi
[ -f "$ROOT/backend/static/index.html" ] || die "the built interface is missing (frontend/build)"
ok "interface ready"

# ── 3. Fresh clinic day ──────────────────────────────────────────────────────
say "3. Starting Klinik Melaka"
if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  printf "  port $PORT is in use, stopping the old copy…\n"
  lsof -ti tcp:$PORT | xargs kill 2>/dev/null; sleep 2
fi
rm -rf "$DATA"; mkdir -p "$DATA/uploads"

export DEPLOYMENT_MODE=standalone IS_CLOUD_NODE=false ALLOW_SEED=true
export JWT_SECRET="medilink-client-demo-secret-not-for-production-32c"
export IC_ENCRYPTION_KEY="Ux3n2rW8kQ5vZ1pL7yT4bN6mJ9cH0sD2fG8aK4eR1oI="
export IC_INDEX_KEY="medilink-client-demo-index"
export KIOSK_TOKEN="demo-kiosk-token"
export MEDILINK_DATA_DIR="$DATA" HARNOVA_DATA_DIR="$DATA" UPLOAD_DIR="$DATA/uploads"
export DATABASE_URL="sqlite:///$DATA/medilink.db" FACILITY_ID=melaka CLINIC_NAME="Klinik Melaka"
export FRONTEND_DIST="$ROOT/backend/static" CLOUD_DATABASE_URL=""
_G=$(grep -E '^GROQ_API_KEY=' "$ROOT/backend/.env" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || true)
export GROQ_API_KEY="${_G:-}"

"$VENV/bin/python" -m uvicorn server:app --app-dir "$ROOT/backend" \
    --host 0.0.0.0 --port $PORT --log-level warning > "$LOG" 2>&1 &
PID=$!
UP=0
for _ in $(seq 1 60); do
  sleep 0.5
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && { UP=1; break; }
  kill -0 $PID 2>/dev/null || break
done
[ "$UP" = "1" ] || { tail -25 "$LOG"; die "the clinic did not start (log above)"; }
ok "clinic is up"

say "4. Loading today's patients"
API="http://127.0.0.1:$PORT/api"
curl -fsS -X POST -H 'Content-Type: application/json' \
  -d '{"clinic_name":"Klinik Melaka","admin_name":"Dr. Admin Melaka","admin_email":"admin@melaka.medilink","admin_password":"Admin@123","clinic_address":"Jalan Kota, 75000 Melaka","clinic_phone":"06-2823100"}' \
  "$API/setup" >/dev/null || die "first-run setup failed"
TOK=$(curl -fsS -X POST -H 'Content-Type: application/json' \
  -d '{"email":"admin@melaka.medilink","password":"Admin@123"}' "$API/auth/login" \
  | "$VENV/bin/python" -c "import json,sys;print(json.load(sys.stdin)['token'])") || die "admin sign-in failed"
curl -fsS -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{}' "$API/seed" >/dev/null \
  || die "loading staff and stock failed"
( cd "$ROOT/backend" && "$VENV/bin/python" demo_seed.py >> "$LOG" 2>&1 ) || die "loading demo patients failed (see $LOG)"
ok "staff, stock and today's queue loaded"

LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
printf "\n${G}  MediLink is running${X}\n\n"
printf "   Front door      ${B}http://127.0.0.1:$PORT${X}\n"
printf "   Kiosk           ${B}http://127.0.0.1:$PORT/kiosk${X}\n"
[ -n "$LAN" ] && printf "   On an iPad or phone (same Wi-Fi):  ${B}http://$LAN:$PORT/kiosk${X}\n"
printf "\n   Sign in as                     email / password\n"
printf "   Reception   reception@medilink.io     Recep@123\n"
printf "   Doctor      dr.tan@medilink.io        Doctor@123\n"
printf "   Pharmacy    pharmacy@medilink.io      Pharm@123\n"
printf "   Clinic admin admin@melaka.medilink    Admin@123\n"
printf "   Patient     IC 850312-10-5231         Demo@1234   (open /login?as=patient)\n"
printf "\n   ${D}Kiosk test IC for a new patient: any valid IC, e.g. 880914-04-6231${X}\n"
printf "   ${D}Log: $LOG${X}\n"
printf "\n   ${Y}Keep this window open during the demo. Close it to stop.${X}\n\n"
open "http://127.0.0.1:$PORT" 2>/dev/null || true
wait $PID
