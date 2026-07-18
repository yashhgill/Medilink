#!/usr/bin/env bash
# MediLink — one-command local clinic server setup (macOS)
# Usage: ./setup-macbook.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "── MediLink local server setup ──"

# 1) Docker Desktop check
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker Desktop not found. Install from https://www.docker.com/products/docker-desktop/ then re-run."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker is installed but not running. Open Docker Desktop, wait for it to start, re-run."
  exit 1
fi
echo "✓ Docker running"

# 2) Generate backend/.env once (secure random secrets, never committed)
if [ ! -f backend/.env ]; then
  JWT=$(openssl rand -hex 32)
  KIOSK=$(openssl rand -hex 24)
  DBPW=$(openssl rand -hex 16)
  cat > backend/.env <<ENV
DATABASE_URL=postgresql://medilink:${DBPW}@db:5432/medilink
CLOUD_DATABASE_URL=
IS_CLOUD_NODE=false
FACILITY_ID=main
SYNC_INTERVAL_SECONDS=30
JWT_SECRET=${JWT}
KIOSK_TOKEN=${KIOSK}
STAFF_JWT_EXP_HOURS=12
ALLOW_SEED=true
GROQ_API_KEY=
CLINIC_NAME=MediLink Clinic
CLINIC_ADDRESS=Bandar Sunway, Selangor
CLINIC_PHONE=+60 3-0000 0000
BANK_ACCOUNT_NO=
BANK_NAME=
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
ENV
  echo "DB_PASSWORD=${DBPW}" > .env            # used by docker-compose for postgres
  echo "REACT_APP_KIOSK_TOKEN=${KIOSK}" > frontend/.env
  echo "✓ Generated backend/.env with fresh secrets (ALLOW_SEED=true for first boot — set false after)"
else
  echo "✓ backend/.env already exists — keeping it"
fi

# 3) Build + start
docker compose up -d --build
echo "✓ Containers starting…"
sleep 5

# 4) Local IP for phone / kiosk on the same wifi
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo ""
echo "──────────────────────────────────────────────────"
echo " MediLink is up. Open these:"
echo ""
echo "  Kiosk (your table):    http://${IP}:3000/kiosk   ← fullscreen it (Cmd+Ctrl+F)"
echo "  Staff login:           http://${IP}:3000/login"
echo "  Phone app (PWA):       http://${IP}:3000  → Share → Add to Home Screen"
echo "  API docs:              http://${IP}:8000/docs"
echo ""
echo " Demo logins (from seed): admin@medilink.io / Admin@123"
echo "                          dr.tan@medilink.io / Doctor@123"
echo "                          pharmacy@medilink.io / Pharm@123"
echo "                          reception@medilink.io / Recep@123"
echo ""
echo " After first boot: edit backend/.env → ALLOW_SEED=false, then:"
echo "   docker compose restart backend"
echo "──────────────────────────────────────────────────"
