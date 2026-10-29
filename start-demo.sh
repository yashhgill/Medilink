#!/usr/bin/env bash
# MediLink Demo Launcher — run this every time before your demo
# Usage: bash ~/Downloads/medilink-fyp/start-demo.sh
set -e

B="\033[1;36m"; G="\033[0;32m"; R="\033[0;31m"; X="\033[0m"
say(){ printf "\n${B}▶  %s${X}\n" "$*"; }
ok(){  printf "  ${G}✓${X}  %s\n" "$*"; }
die(){ printf "\n${R}FAIL${X}  %s\n" "$*"; exit 1; }

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── 1. Kill existing servers ──────────────────────────────────────────────
say "Stopping existing servers"
for PORT in 8000 8001 8002; do
  PIDS=$(lsof -ti tcp:$PORT 2>/dev/null || true)
  [ -n "$PIDS" ] && echo "$PIDS" | xargs kill -9 2>/dev/null || true
done
sleep 1
ok "Ports cleared"

# ── 2. Wipe local DBs (keeps Supabase cloud data intact) ─────────────────
say "Wiping local databases"
rm -rf "$HOME/.medilink-demo"
mkdir -p "$HOME/.medilink-demo/melaka/uploads" "$HOME/.medilink-demo/jasin/uploads"
ok "Clean local state"

# ── 3. Load environment ───────────────────────────────────────────────────
say "Loading environment"
export DEPLOYMENT_MODE=networked
export JWT_SECRET="medilink-psm1-demo-secret-not-for-production-32ch"
export IC_ENCRYPTION_KEY="Ux3n2rW8kQ5vZ1pL7yT4bN6mJ9cH0sD2fG8aK4eR1oI="
export IC_INDEX_KEY="medilink-psm1-demo-blind-index-key"
export KIOSK_TOKEN="demo-kiosk-token"
export ALLOW_SEED=true
export IS_CLOUD_NODE=false
export FRONTEND_DIST="$ROOT/backend/static"
export CLOUD_DATABASE_URL="$(grep '^CLOUD_DATABASE_URL=' "$ROOT/backend/.env" | cut -d'=' -f2-)"
ok "Environment ready"

# ── 4. Start Clinic A — Klinik Melaka (8001) ─────────────────────────────
say "Starting Clinic A — Klinik Melaka (:8001)"
env MEDILINK_DATA_DIR="$HOME/.medilink-demo/melaka" \
    HARNOVA_DATA_DIR="$HOME/.medilink-demo/melaka" \
    DATABASE_URL="sqlite:///$HOME/.medilink-demo/melaka/medilink.db" \
    UPLOAD_DIR="$HOME/.medilink-demo/melaka/uploads" \
    FACILITY_ID=melaka CLINIC_NAME="Klinik Melaka" \
    HARNOVA_PORT=8001 MEDILINK_PORT=8001 \
    FRONTEND_DIST="$FRONTEND_DIST" \
nohup python3 -m uvicorn server:app --app-dir "$ROOT/backend" \
    --host 127.0.0.1 --port 8001 --log-level warning \
    > /tmp/medilink-melaka.log 2>&1 &

# ── 5. Start Clinic B — Klinik Jasin (8002) ──────────────────────────────
say "Starting Clinic B — Klinik Jasin (:8002)"
env MEDILINK_DATA_DIR="$HOME/.medilink-demo/jasin" \
    HARNOVA_DATA_DIR="$HOME/.medilink-demo/jasin" \
    DATABASE_URL="sqlite:///$HOME/.medilink-demo/jasin/medilink.db" \
    UPLOAD_DIR="$HOME/.medilink-demo/jasin/uploads" \
    FACILITY_ID=jasin CLINIC_NAME="Klinik Jasin" \
    HARNOVA_PORT=8002 MEDILINK_PORT=8002 \
    FRONTEND_DIST="$FRONTEND_DIST" \
nohup python3 -m uvicorn server:app --app-dir "$ROOT/backend" \
    --host 127.0.0.1 --port 8002 --log-level warning \
    > /tmp/medilink-jasin.log 2>&1 &

# ── 6. Start Gateway (8000) ───────────────────────────────────────────────
say "Starting Gateway (:8000)"
env CLINIC_A_URL=http://127.0.0.1:8001 \
    CLINIC_B_URL=http://127.0.0.1:8002 \
    FRONTEND_DIST="$FRONTEND_DIST" \
nohup python3 -m uvicorn gateway:app --app-dir "$ROOT/backend" \
    --host 0.0.0.0 --port 8000 --log-level warning \
    > /tmp/medilink-gateway.log 2>&1 &

# ── 7. Wait for all three ─────────────────────────────────────────────────
say "Waiting for servers to be ready"
for PORT in 8001 8002 8000; do
  UP=0
  for i in $(seq 1 40); do
    sleep 1
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && UP=1 && break
  done
  if [ "$UP" = "1" ]; then
    ok "Port $PORT ready"
  else
    NAME=$([ "$PORT" = "8001" ] && echo melaka || ([ "$PORT" = "8002" ] && echo jasin || echo gateway))
    die "Port $PORT failed. Check: tail -30 /tmp/medilink-$NAME.log"
  fi
done

# ── 8. Seed staff accounts (idempotent — safe to run every time) ──────────
say "Seeding staff accounts"
TOK_A=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@melaka.medilink","password":"Admin@123"}' \
  http://127.0.0.1:8001/api/auth/login | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ -n "$TOK_A" ]; then
  curl -s -X POST -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOK_A" -d '{}' \
    http://127.0.0.1:8001/api/seed > /dev/null 2>&1 || true
  ok "Melaka staff seeded"
else
  # First run — need setup first
  curl -s -X POST -H "Content-Type: application/json" \
    -d '{"clinic_name":"Klinik Melaka","admin_name":"Dr. Admin Melaka","admin_email":"admin@melaka.medilink","admin_password":"Admin@123","clinic_address":"Jalan Kota, Melaka Tengah, 75000 Melaka","clinic_phone":"06-2823100"}' \
    http://127.0.0.1:8001/api/setup > /dev/null 2>&1 || true
  TOK_A=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"email":"admin@melaka.medilink","password":"Admin@123"}' \
    http://127.0.0.1:8001/api/auth/login | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
  curl -s -X POST -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOK_A" -d '{}' \
    http://127.0.0.1:8001/api/seed > /dev/null 2>&1 || true
  ok "Melaka set up and seeded"
fi

TOK_B=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@jasin.medilink","password":"Admin@123"}' \
  http://127.0.0.1:8002/api/auth/login | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ -n "$TOK_B" ]; then
  curl -s -X POST -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOK_B" -d '{}' \
    http://127.0.0.1:8002/api/seed > /dev/null 2>&1 || true
  ok "Jasin staff seeded"
else
  curl -s -X POST -H "Content-Type: application/json" \
    -d '{"clinic_name":"Klinik Jasin","admin_name":"Dr. Admin Jasin","admin_email":"admin@jasin.medilink","admin_password":"Admin@123","clinic_address":"Jalan Genuang, 77000 Jasin, Melaka","clinic_phone":"06-5281234"}' \
    http://127.0.0.1:8002/api/setup > /dev/null 2>&1 || true
  TOK_B=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"email":"admin@jasin.medilink","password":"Admin@123"}' \
    http://127.0.0.1:8002/api/auth/login | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
  curl -s -X POST -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOK_B" -d '{}' \
    http://127.0.0.1:8002/api/seed > /dev/null 2>&1 || true
  ok "Jasin set up and seeded"
fi

# ── Done ──────────────────────────────────────────────────────────────────
printf "\n${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${X}\n"
printf "${G}  MediLink Demo Ready!${X}\n\n"
printf "  Clinic A (Melaka):  http://127.0.0.1:8001\n"
printf "  Clinic B (Jasin):   http://127.0.0.1:8002\n"
printf "  Gateway:            http://127.0.0.1:8000\n\n"
printf "  Login: dr.tan@medilink.io / Doctor@123\n\n"
printf "  To expose publicly (run in a NEW terminal tab):\n"
printf "  ${B}npx localtunnel --port 8000${X}\n"
printf "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${X}\n\n"
