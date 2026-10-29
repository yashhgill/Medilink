#!/usr/bin/env bash
# Runs the full PSM 2 measurement suite against freshly booted nodes.
# Needs: PostgreSQL on :5433 (the cloud node), netfault.py on :7543 -> :5433 (control :6600),
# and a boot script that starts one clinic node on :8001 ($BOOT, honours MODE, CLOUD, PRIMARY_DB, NOSEED).
set -u
cd "$(dirname "$0")"
BOOT=${BOOT:?set BOOT to the clinic boot script}
[ -n "$VENV" ] && . "$VENV/bin/activate"
CLOUD_URL="postgresql://postgres@127.0.0.1:7543/cloud"
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "E3 replication latency"
curl -s localhost:6600/up >/dev/null
NOSEED=1 MODE=networked CLOUD=$CLOUD_URL $BOOT >/dev/null 2>&1; sleep 4
python measure.py e3 --n 200 --latency-ms 0 --label local-first
python measure.py e3 --n 200 --latency-ms 40 --label local-first

log "E2 recovery vs volume (3 repeats)"
NOSEED=1 MODE=networked CLOUD=$CLOUD_URL $BOOT >/dev/null 2>&1; sleep 4
python measure.py e2 --volumes 10,50,100,250,500 --repeats 3 --label final

for mode in down blackhole; do
  log "E1 local-first, outage=$mode"
  curl -s localhost:6600/up >/dev/null
  NOSEED=1 MODE=networked CLOUD=$CLOUD_URL $BOOT >/dev/null 2>&1; sleep 4
  python measure.py e1 --label local-first --outage $mode --before 30 --outage-s 60 --after 30 --rate 1
done

for mode in down blackhole; do
  log "E1 cloud-only baseline, outage=$mode"
  curl -s localhost:6600/up >/dev/null
  psql -h 127.0.0.1 -p 5433 -U postgres -qc "drop database if exists cloudonly" -c "create database cloudonly" >/dev/null
  PRIMARY_DB="postgresql://postgres@127.0.0.1:7543/cloudonly" NOSEED=1 MODE=standalone $BOOT >/dev/null 2>&1; sleep 4
  python measure.py e1 --label cloud-only --outage $mode --before 30 --outage-s 60 --after 30 --rate 1
done
curl -s localhost:6600/up >/dev/null
log "done"
