#!/bin/bash
# ── MediLink stopper ─────────────────────────────────────────────────────────
# Double-click to stop both clinics (data is kept — this just frees resources).
cd "$(dirname "$0")"
echo "→ Stopping Clinic B…"
docker compose -p clinicb -f docker-compose.clinicb.yml down >/dev/null 2>&1
echo "→ Stopping Clinic A…"
docker compose down >/dev/null 2>&1
echo "✓ Both clinics stopped. Your data is safe (kept in Docker volumes + cloud)."
echo "  Double-click Start-MediLink to bring them back."
sleep 2
