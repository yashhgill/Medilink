#!/bin/bash
# ── MediLink one-click launcher ──────────────────────────────────────────────
# Double-click this file to bring up both clinics and open them in your browser.
set -e
cd "$(dirname "$0")"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║        Starting MediLink…            ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# 1) Make sure Docker Desktop is running
if ! docker info >/dev/null 2>&1; then
  echo "→ Starting Docker Desktop (this takes ~30s the first time)…"
  open -a Docker
  # wait up to 90s for the daemon
  for i in $(seq 1 45); do
    if docker info >/dev/null 2>&1; then break; fi
    sleep 2
    printf "."
  done
  echo ""
  if ! docker info >/dev/null 2>&1; then
    echo "✗ Docker didn't start. Open Docker Desktop manually, then run this again."
    read -n 1 -s -r -p "Press any key to close."
    exit 1
  fi
fi
echo "✓ Docker is running"

# 2) Start Clinic A (Melaka)
echo "→ Starting Clinic A (Melaka)…"
docker compose up -d >/dev/null 2>&1
echo "✓ Clinic A up"

# 3) Start Clinic B (Sunway)
echo "→ Starting Clinic B (Sunway)…"
docker compose -p clinicb -f docker-compose.clinicb.yml up -d >/dev/null 2>&1
echo "✓ Clinic B up"

# 4) Wait for both backends to answer
echo "→ Waiting for the clinics to be ready…"
ready_a=false; ready_b=false
for i in $(seq 1 30); do
  curl -sf http://localhost:8000/api/health >/dev/null 2>&1 && ready_a=true
  curl -sf http://localhost:8010/api/health >/dev/null 2>&1 && ready_b=true
  if $ready_a && $ready_b; then break; fi
  sleep 2; printf "."
done
echo ""
$ready_a && echo "✓ Clinic A ready" || echo "… Clinic A still warming up"
$ready_b && echo "✓ Clinic B ready" || echo "… Clinic B still warming up"

# 5) Open the clinic pages in the default browser
echo "→ Opening clinic pages…"
open "http://localhost:3000/login"      # Clinic A staff
open "http://localhost:3010/login"      # Clinic B staff

echo ""
echo "  MediLink is running:"
echo "    Clinic A (Melaka):  http://yashhs-macbook-air.local:3000"
echo "    Clinic B (Sunway):  http://yashhs-macbook-air.local:3010"
echo "    Patient (cloud):    http://44.209.64.89:3000"
echo ""
echo "  This window can be closed."
sleep 2
