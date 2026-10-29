#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  MediLink — PSM 1 demonstration launcher
#
#  Double-click this file. It starts:
#    • Klinik Melaka   http://127.0.0.1:8001  (internal)
#    • Klinik Jasin    http://127.0.0.1:8002  (internal)
#    • Patient Gateway http://127.0.0.1:8000  ← public-facing single URL
#
#  Patients activate / log in via port 8000, which federates across both
#  clinic databases so a code from either clinic always works.
#
#  Ctrl+C stops everything.
# ═══════════════════════════════════════════════════════════════════════════
set +e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# PIDs initialised early so cleanup trap never references unbound vars
PID_A=0; PID_B=0; PID_C=0; PID_GW=0
cleanup(){
  printf "\n  stopping…\n"
  for _PID in "$PID_A" "$PID_B" "$PID_C" "$PID_GW"; do
    [ "$_PID" != "0" ] && kill "$_PID" 2>/dev/null || true
  done
  wait 2>/dev/null
  printf "  stopped.\n"
}
trap cleanup EXIT INT TERM

B="\033[1;36m"; G="\033[0;32m"; Y="\033[0;33m"; R="\033[0;31m"; D="\033[2m"; X="\033[0m"
say(){ printf "\n${B}%s${X}\n" "$*"; }
ok(){  printf "  ${G}OK${X}   %s\n" "$*"; }
warn(){ printf "  ${Y}!${X}    %s\n" "$*"; }
bad(){ printf "  ${R}FAIL${X} %s\n" "$*"; }

PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null || { bad "Python 3 not found."; read -r -p "Return to close…" _; exit 1; }

say "MediLink demonstration"
printf "  %s\n" "$($PY --version)"

# ── dependencies ─────────────────────────────────────────────────────────────
say "1. Checking dependencies"
if ! $PY -c "import fastapi, uvicorn, databases, aiosqlite, jwt, bcrypt, fpdf, qrcode, groq" 2>/dev/null; then
  warn "installing what's missing (one time, ~1 min)…"
  $PY -m pip install --quiet --user \
      fastapi uvicorn "databases[aiosqlite]" aiosqlite sqlalchemy \
      "passlib[bcrypt]" bcrypt pyjwt cryptography "pydantic[email]" \
      fpdf2 python-dotenv python-multipart "qrcode[pil]" Pillow httpx groq \
    || $PY -m pip install --quiet --break-system-packages \
      fastapi uvicorn "databases[aiosqlite]" aiosqlite sqlalchemy \
      "passlib[bcrypt]" bcrypt pyjwt cryptography "pydantic[email]" \
      fpdf2 python-dotenv python-multipart "qrcode[pil]" Pillow httpx groq
fi
ok "dependencies ready"

# ── user interface ────────────────────────────────────────────────────────────
say "2. Checking the interface"
# Always sync frontend/build → backend/static so branding is always fresh
if [ -f "$ROOT/frontend/build/index.html" ]; then
  rm -rf "$ROOT/backend/static"
  cp -r "$ROOT/frontend/build" "$ROOT/backend/static"
  ok "interface synced"
elif [ -f "$ROOT/backend/static/index.html" ]; then
  ok "interface ready (cached)"
else
  warn "building the interface (a few minutes, one time)…"
  ( cd "$ROOT/frontend" \
    && REACT_APP_BACKEND_URL="" GENERATE_SOURCEMAP=false \
       NODE_OPTIONS=--max-old-space-size=3072 npm install --legacy-peer-deps \
    && npm install --legacy-peer-deps ajv@8 ajv-keywords@5 \
    && REACT_APP_BACKEND_URL="" REACT_APP_KIOSK_TOKEN="demo-kiosk-token" GENERATE_SOURCEMAP=false npm run build ) \
    || { bad "interface build failed"; read -r -p "Return to close…" _; exit 1; }
  rm -rf "$ROOT/backend/static"
  cp -r "$ROOT/frontend/build" "$ROOT/backend/static"
fi
ok "interface ready"

# ── shared demo settings ──────────────────────────────────────────────────────
export DEPLOYMENT_MODE=networked
export JWT_SECRET="medilink-psm1-demo-secret-not-for-production-32ch"
export IC_ENCRYPTION_KEY="Ux3n2rW8kQ5vZ1pL7yT4bN6mJ9cH0sD2fG8aK4eR1oI="
export IC_INDEX_KEY="medilink-psm1-demo-blind-index-key"
export KIOSK_TOKEN="demo-kiosk-token"
export ALLOW_SEED=true
# Read GROQ key from .env using full path (works when double-clicked from Finder)
_GROQ=$(grep -E '^GROQ_API_KEY=' "$ROOT/backend/.env" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || true)
export GROQ_API_KEY="${_GROQ:-}"
if [ -n "$GROQ_API_KEY" ]; then
  ok "GROQ AI triage enabled"
else
  warn "GROQ key not found — using offline triage engine"
fi
DATABASE_URL=""
export CLOUD_DATABASE_URL="$(grep -E '^CLOUD_DATABASE_URL=' "$ROOT/backend/.env" 2>/dev/null | cut -d= -f2- || true)"
export IS_CLOUD_NODE="false"

# ── start clinic nodes ────────────────────────────────────────────────────────
say "3. Starting clinic nodes"

_start_clinic() {
  local NAME="$1" CODE="$2" PORT="$3" DIR="$HOME/.medilink-demo/$2"
  mkdir -p "$DIR"
  MEDILINK_DATA_DIR="$DIR" HARNOVA_DATA_DIR="$DIR" \
  DATABASE_URL="sqlite:///$DIR/medilink.db" \
  UPLOAD_DIR="$DIR/uploads" \
  FACILITY_ID="$CODE" CLINIC_NAME="$NAME" \
  FRONTEND_DIST="$ROOT/backend/static" \
  HARNOVA_PORT="$PORT" MEDILINK_PORT="$PORT" \
  GROQ_API_KEY="$GROQ_API_KEY" \
  $PY -m uvicorn server:app --app-dir "$ROOT/backend" \
      --host 127.0.0.1 --port "$PORT" --log-level warning \
      > "/tmp/medilink-$CODE.log" 2>&1 &
}

# ── clinic list — add more lines here for more clinics ───────────────────────
# Format: _start_clinic "Display Name" "code" PORT
# Each clinic gets its own SQLite DB at ~/.medilink-demo/<code>/
_start_clinic "Klinik Melaka"    "melaka"    8001
PID_A=$!
_start_clinic "Klinik Jasin"     "jasin"     8002
PID_B=$!
# Uncomment to add a 3rd clinic:
# _start_clinic "Klinik Seremban" "seremban"  8003
# PID_C=$!

CLINIC_PORTS="8001 8002"  # add 8003 here too if you uncomment above

# wait for clinics
for P in $CLINIC_PORTS; do
  UP=0
  for _ in $(seq 1 60); do
    sleep 0.5
    if curl -fsS "http://127.0.0.1:$P/api/health" >/dev/null 2>&1; then UP=1; break; fi
  done
  if [ "$UP" = "1" ]; then ok "clinic on port $P is up"
  else
    bad "clinic on port $P did not start. Log:"
    tail -20 "/tmp/medilink-$([ "$P" = "8001" ] && echo melaka || echo jasin).log"
    kill "$PID_A" "$PID_B" 2>/dev/null
    read -r -p "Return to close…" _; exit 1
  fi
done

# ── start patient gateway on port 8000 ───────────────────────────────────────
say "4. Starting patient gateway (port 8000)"
FRONTEND_DIST="$ROOT/backend/static" \
CLINIC_A_URL="http://127.0.0.1:8001" \
CLINIC_B_URL="http://127.0.0.1:8002" \
$PY -m uvicorn gateway:app --app-dir "$ROOT/backend" \
    --host 0.0.0.0 --port 8000 --log-level warning \
    > "/tmp/medilink-gateway.log" 2>&1 &
PID_GW=$!

# wait for gateway
UP=0
for _ in $(seq 1 30); do
  sleep 0.5
  if curl -fsS "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then UP=1; break; fi
done
if [ "$UP" = "1" ]; then ok "patient gateway is up"
else
  bad "gateway did not start. Log:"
  tail -10 "/tmp/medilink-gateway.log"
  warn "Clinics still running — continuing without gateway"
fi

printf "\n"
printf "${G}  ╔════════════════════════════════════════════════════════════╗\n"
printf "  ║                    MediLink is running                     ║\n"
printf "  ╚════════════════════════════════════════════════════════════╝${X}\n"
printf "\n"
printf "   Patient portal  ${B}http://127.0.0.1:8000${X}   ← single public URL\n"
printf "   Klinik Melaka   ${B}http://127.0.0.1:8001${X}   (clinic staff)\n"
printf "   Klinik Jasin    ${B}http://127.0.0.1:8002${X}   (clinic staff)\n"
printf "\n"
printf "   Kiosk           add ${B}/kiosk${X} to 8001 or 8002\n"
printf "\n"
printf "   ${D}Logs:  /tmp/medilink-melaka.log\n"
printf "          /tmp/medilink-jasin.log\n"
printf "          /tmp/medilink-gateway.log${X}\n"
printf "\n"
printf "${Y}   FIRST RUN: setup wizard appears. Create admin at BOTH clinics.${X}\n"
printf "\n"
printf "   ${D}To reset everything:  rm -rf ~/.medilink-demo${X}\n"
printf "\n"
printf "   For Cloudflare tunnel: run Cloudflare-Tunnel.command in a new window.\n"
printf "   Press ${B}Ctrl+C${X} to stop everything.\n"
printf "\n"

sleep 1
open "http://127.0.0.1:8000" 2>/dev/null || true

for _PID in "$PID_A" "$PID_B" "$PID_C" "$PID_GW"; do
  [ "$_PID" != "0" ] && wait "$_PID" 2>/dev/null || true
done
