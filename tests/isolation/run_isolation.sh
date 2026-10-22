#!/usr/bin/env bash
# Builds a cloud node from migration 002 on a local PostgreSQL (port 5433), starts
# two clinic nodes against it as medilink_app, and runs isolation_test.py.
# Needs: PostgreSQL superuser access on :5433, the clinic node's Python env active.
set -eu
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
PG="psql -h 127.0.0.1 -p 5433 -U postgres -v ON_ERROR_STOP=1 -q"
APP_PW=${APP_PW:-isolation-test-only}

# 1. Fresh database with the clinic schema in medilink, then the RLS migration.
$PG -c "DROP DATABASE IF EXISTS rlsdb" -c "CREATE DATABASE rlsdb"
python - <<EOF
import os, sys
os.environ.update(DEPLOYMENT_MODE="standalone", MEDILINK_DATA_DIR="/tmp/iso-schema", DATABASE_URL="sqlite:////tmp/iso-schema.db")
os.makedirs("/tmp/iso-schema", exist_ok=True)
sys.path.insert(0, "$ROOT/backend")
import logging; logging.disable(logging.WARNING)
import server
from sqlalchemy import create_engine, text
e = create_engine("postgresql+psycopg2://postgres@127.0.0.1:5433/rlsdb")
with e.begin() as c:
    c.execute(text("CREATE SCHEMA IF NOT EXISTS medilink"))
    c.execute(text("SET search_path TO medilink"))
    # Only the replicated tables live on the cloud node; counters and the
    # sync queue are clinic-local, and migration 002 refuses any table without RLS.
    server.metadata.create_all(c, tables=[t for n, t in server.metadata.tables.items() if n not in ("counters", "sync_queue")])
print("schema created in medilink")
EOF
$PG -d rlsdb -f "$ROOT/backend/migrations/002_supabase_cloud_node.sql" >/dev/null
$PG -d rlsdb -f "$ROOT/backend/migrations/003_cloud_per_clinic_uniqueness.sql" >/dev/null
$PG -d rlsdb -f "$ROOT/backend/migrations/004_per_clinic_logins.sql" >/dev/null
$PG -c "ALTER ROLE medilink_app PASSWORD '$APP_PW'"
echo "migration 002 applied; RLS forced and medilink_app cannot bypass it"

# 2. Two clinic nodes, connecting as medilink_app through RLS.
CLOUD="postgresql://medilink_app:$APP_PW@127.0.0.1:5433/rlsdb?options=-csearch_path%3Dmedilink"
pkill -f "port 810[12]" 2>/dev/null || true
for spec in "melaka 8101" "jasin 8102"; do
  set -- $spec; F=$1; P=$2; D=/tmp/iso-$F; rm -rf $D; mkdir -p $D/uploads
  env DEPLOYMENT_MODE=networked JWT_SECRET=isolation-test-secret-not-for-production-32c \
      IC_ENCRYPTION_KEY="Ux3n2rW8kQ5vZ1pL7yT4bN6mJ9cH0sD2fG8aK4eR1oI=" IC_INDEX_KEY=shared-index-key \
      KIOSK_TOKEN=demo-kiosk-token ALLOW_SEED=true IS_CLOUD_NODE=false \
      MEDILINK_DATA_DIR=$D HARNOVA_DATA_DIR=$D DATABASE_URL="sqlite:///$D/medilink.db" UPLOAD_DIR=$D/uploads \
      FACILITY_ID=$F CLINIC_NAME="Klinik ${F^}" CLOUD_DATABASE_URL="$CLOUD" CLOUD_SCHEMA=medilink \
    nohup python -m uvicorn server:app --app-dir "$ROOT/backend" --host 127.0.0.1 --port $P --log-level warning > /tmp/iso-$F.log 2>&1 &
done
for P in 8101 8102; do for i in $(seq 1 40); do curl -fsS http://127.0.0.1:$P/api/health >/dev/null 2>&1 && break; sleep 1; done; done
for P in 8101 8102; do
  curl -s -X POST -H 'Content-Type: application/json' -d '{"clinic_name":"Klinik","admin_name":"Admin","admin_email":"admin@iso.my","admin_password":"Admin@12345"}' http://127.0.0.1:$P/api/setup >/dev/null
  T=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"email":"admin@iso.my","password":"Admin@12345"}' http://127.0.0.1:$P/api/auth/login | python -c "import json,sys;print(json.load(sys.stdin)['token'])")
  curl -s -X POST -H "Authorization: Bearer $T" http://127.0.0.1:$P/api/seed >/dev/null
done
sleep 3

# 3. The test.
CLOUD_APP="postgresql://medilink_app:$APP_PW@127.0.0.1:5433/rlsdb" CLOUD_SUPER="postgresql://postgres@127.0.0.1:5433/rlsdb" \
  python isolation_test.py
pkill -f "port 810[12]" 2>/dev/null || true
