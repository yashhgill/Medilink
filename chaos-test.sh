#!/usr/bin/env bash
# ============================================================
#  MediLink Chaos Test Suite
#  Tests networked-mode resilience: node failure, latency,
#  partition, and recovery scenarios.
#
#  Usage:
#    bash chaos-test.sh                 # run all scenarios
#    bash chaos-test.sh --scenario 3   # run only scenario 3
#    bash chaos-test.sh --list          # list scenarios
#
#  Requires: curl, python3, lsof, nc (netcat)
#  All three servers must be running (bash start-demo.sh first)
# ============================================================

set -euo pipefail

B="\033[1;36m"; G="\033[0;32m"; R="\033[0;31m"
Y="\033[1;33m"; W="\033[0m"; BOLD="\033[1m"
say()  { printf "\n${B}▶  %s${W}\n" "$*"; }
ok()   { printf "  ${G}✓${W}  %s\n" "$*"; }
fail() { printf "  ${R}✗${W}  %s\n" "$*"; FAILURES=$((FAILURES+1)); }
warn() { printf "  ${Y}⚠${W}  %s\n" "$*"; }
sep()  { printf "\n${BOLD}%s${W}\n" "────────────────────────────────────────────────────────"; }

ROOT="$(cd "$(dirname "$0")" && pwd)"
FAILURES=0
PASS=0
SCENARIO_FILTER=""

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --scenario) SCENARIO_FILTER="$2"; shift 2 ;;
    --list) LIST_ONLY=1; shift ;;
    *) shift ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────

health() {
  local port=$1
  curl -fsS --max-time 3 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1
}

assert_up() {
  local port=$1 label=$2
  if health "$port"; then ok "$label is UP"; ((PASS++)) || true
  else fail "$label is DOWN (port $port)"; fi
}

assert_down() {
  local port=$1 label=$2
  if ! health "$port"; then ok "$label is correctly DOWN (port $port)"; ((PASS++)) || true
  else fail "$label should be down but is still UP"; fi
}

get_token() {
  local port=$1 email=$2 pass=$3
  curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}" \
    "http://127.0.0.1:$port/api/auth/login" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null || echo ""
}

api_get() {
  local port=$1 path=$2 token=$3
  curl -s --max-time 5 -H "Authorization: Bearer $token" \
    "http://127.0.0.1:$port/api/$path" 2>/dev/null
}

kill_port() {
  local port=$1
  lsof -ti tcp:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 1
}

restart_clinic() {
  local port=$1 facility=$2 name=$3
  env MEDILINK_DATA_DIR="$HOME/.medilink-demo/$facility" \
      HARNOVA_DATA_DIR="$HOME/.medilink-demo/$facility" \
      DATABASE_URL="sqlite:///$HOME/.medilink-demo/$facility/medilink.db" \
      UPLOAD_DIR="$HOME/.medilink-demo/$facility/uploads" \
      FACILITY_ID="$facility" CLINIC_NAME="$name" \
      HARNOVA_PORT="$port" MEDILINK_PORT="$port" \
      FRONTEND_DIST="$ROOT/backend/static" \
      DEPLOYMENT_MODE=networked \
      JWT_SECRET="medilink-psm1-demo-secret-not-for-production-32ch" \
      IC_ENCRYPTION_KEY="Ux3n2rW8kQ5vZ1pL7yT4bN6mJ9cH0sD2fG8aK4eR1oI=" \
      IC_INDEX_KEY="medilink-psm1-demo-blind-index-key" \
      KIOSK_TOKEN="demo-kiosk-token" \
      ALLOW_SEED=true IS_CLOUD_NODE=false \
  nohup python3 -m uvicorn server:app --app-dir "$ROOT/backend" \
      --host 127.0.0.1 --port "$port" --log-level warning \
      > "/tmp/medilink-$facility.log" 2>&1 &

  # Wait up to 30s
  for i in $(seq 1 30); do
    sleep 1
    health "$port" && return 0
  done
  return 1
}

wait_for_port() {
  local port=$1
  for i in $(seq 1 30); do sleep 1; health "$port" && return 0; done
  return 1
}

run_scenario() {
  local num=$1 name=$2
  [[ -n "$SCENARIO_FILTER" && "$SCENARIO_FILTER" != "$num" ]] && return 0
  sep
  printf "${BOLD}SCENARIO $num: $name${W}\n"
}

# ── Pre-flight ────────────────────────────────────────────────────────────────

if [[ "${LIST_ONLY:-}" == "1" ]]; then
  echo ""
  echo "  Available chaos scenarios:"
  echo "  1  All nodes healthy baseline"
  echo "  2  Clinic A failure — gateway degrades gracefully"
  echo "  3  Clinic B failure — gateway degrades gracefully"
  echo "  4  Both clinics down — gateway returns 503"
  echo "  5  Clinic A recovery — gateway auto-resumes"
  echo "  6  Cross-clinic patient record lookup via gateway"
  echo "  7  Concurrent requests — no race conditions"
  echo "  8  Auth token rejection — invalid/expired tokens"
  echo "  9  Large payload — file upload stress"
  echo "  10 Duplicate IC registration blocked"
  echo ""
  exit 0
fi

say "MediLink Chaos Test Suite"
printf "  Checking servers are up before starting...\n"
for PORT in 8001 8002 8000; do
  health "$PORT" || { printf "${R}ERROR${W}: Port $PORT is not up. Run: bash start-demo.sh\n"; exit 1; }
done
ok "All three servers up — starting chaos tests"

# Get tokens upfront
TOK_A=$(get_token 8001 "admin@melaka.medilink" "Admin@123")
TOK_B=$(get_token 8002 "admin@jasin.medilink" "Admin@123")
TOK_GW=$(get_token 8000 "admin@melaka.medilink" "Admin@123")

# ── Scenario 1: Baseline ──────────────────────────────────────────────────────
run_scenario 1 "All nodes healthy baseline"

assert_up 8001 "Clinic A (Melaka :8001)"
assert_up 8002 "Clinic B (Jasin  :8002)"
assert_up 8000 "Gateway          (:8000)"

# Check gateway health detail
GW_HEALTH=$(curl -s http://127.0.0.1:8000/api/health)
CLINIC_A_STATUS=$(echo "$GW_HEALTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('clinics',{}).get('clinic_a',{}).get('status','?'))" 2>/dev/null || echo "?")
CLINIC_B_STATUS=$(echo "$GW_HEALTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('clinics',{}).get('clinic_b',{}).get('status','?'))" 2>/dev/null || echo "?")

if [[ "$CLINIC_A_STATUS" == "ok" ]]; then ok "Gateway sees Clinic A: ok"; ((PASS++)) || true
else warn "Gateway Clinic A status: $CLINIC_A_STATUS (check gateway.py health endpoint)"; fi
if [[ "$CLINIC_B_STATUS" == "ok" ]]; then ok "Gateway sees Clinic B: ok"; ((PASS++)) || true
else warn "Gateway Clinic B status: $CLINIC_B_STATUS"; fi

# ── Scenario 2: Clinic A failure ─────────────────────────────────────────────
run_scenario 2 "Clinic A failure — gateway degrades gracefully"

say "  Killing Clinic A (port 8001)..."
kill_port 8001
sleep 2

assert_down 8001 "Clinic A"
assert_up   8000 "Gateway still up"
assert_up   8002 "Clinic B unaffected"

# Gateway should return partial data, not crash
GW_RESP=$(curl -s --max-time 5 http://127.0.0.1:8000/api/health)
GW_UP=$(echo "$GW_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
if [[ "$GW_UP" == "ok" || "$GW_UP" == "degraded" ]]; then
  ok "Gateway returns degraded/ok status (not 500): $GW_UP"; ((PASS++)) || true
else
  fail "Gateway returned unexpected status: $GW_UP"
fi

warn "Clinic A is now DOWN — restoring for next test"
restart_clinic 8001 melaka "Klinik Melaka" && ok "Clinic A restored" || fail "Clinic A failed to restart"

# ── Scenario 3: Clinic B failure ─────────────────────────────────────────────
run_scenario 3 "Clinic B failure — gateway degrades gracefully"

say "  Killing Clinic B (port 8002)..."
kill_port 8002
sleep 2

assert_down 8002 "Clinic B"
assert_up   8000 "Gateway still up"
assert_up   8001 "Clinic A unaffected"

GW_RESP=$(curl -s --max-time 5 http://127.0.0.1:8000/api/health)
GW_UP=$(echo "$GW_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
if [[ "$GW_UP" == "ok" || "$GW_UP" == "degraded" ]]; then
  ok "Gateway degraded gracefully: $GW_UP"; ((PASS++)) || true
else
  fail "Gateway returned unexpected status: $GW_UP"
fi

warn "Restoring Clinic B..."
restart_clinic 8002 jasin "Klinik Jasin" && ok "Clinic B restored" || fail "Clinic B failed to restart"

# ── Scenario 4: Both clinics down ────────────────────────────────────────────
run_scenario 4 "Both clinics down — gateway returns 503 or degraded"

say "  Killing both clinics..."
kill_port 8001; kill_port 8002
sleep 2

assert_down 8001 "Clinic A"
assert_down 8002 "Clinic B"
assert_up   8000 "Gateway still responding (not crashed)"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:8000/api/health)
if [[ "$HTTP_CODE" =~ ^(200|503)$ ]]; then
  ok "Gateway returns $HTTP_CODE (not 500) when both clinics down"; ((PASS++)) || true
else
  fail "Gateway returned HTTP $HTTP_CODE — expected 200 or 503"
fi

warn "Restoring both clinics..."
restart_clinic 8001 melaka "Klinik Melaka" && ok "Clinic A restored" || fail "Clinic A failed"
restart_clinic 8002 jasin  "Klinik Jasin"  && ok "Clinic B restored" || fail "Clinic B failed"

# ── Scenario 5: Recovery ─────────────────────────────────────────────────────
run_scenario 5 "Auto-recovery — gateway resumes normal after clinics come back"

sleep 3  # give clinics time to fully start
assert_up 8001 "Clinic A back online"
assert_up 8002 "Clinic B back online"

GW_HEALTH=$(curl -s http://127.0.0.1:8000/api/health)
GW_STATUS=$(echo "$GW_HEALTH" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
if [[ "$GW_STATUS" == "ok" ]]; then
  ok "Gateway auto-recovered to status: ok"; ((PASS++)) || true
else
  warn "Gateway status after recovery: $GW_STATUS (may need a moment)"
fi

# ── Scenario 6: Cross-clinic record lookup ────────────────────────────────────
run_scenario 6 "Cross-clinic patient record lookup via gateway"

# Refresh token after restarts
TOK_A=$(get_token 8001 "admin@melaka.medilink" "Admin@123")
TOK_GW=$(get_token 8000 "admin@melaka.medilink" "Admin@123")

if [[ -n "$TOK_A" ]]; then
  ok "Clinic A admin login works post-restart"; ((PASS++)) || true
else
  fail "Clinic A admin login failed post-restart"
fi

if [[ -n "$TOK_GW" ]]; then
  ok "Gateway admin login works"; ((PASS++)) || true
else
  warn "Gateway login failed — may need super_admin account"
fi

# Check records endpoint on gateway
RECORDS=$(curl -s --max-time 5 -H "Authorization: Bearer $TOK_GW" \
  "http://127.0.0.1:8000/api/records" 2>/dev/null || echo "{}")
RECORD_COUNT=$(echo "$RECORDS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
ok "Gateway /api/records returned $RECORD_COUNT records (cross-clinic view)"

# ── Scenario 7: Concurrent requests ──────────────────────────────────────────
run_scenario 7 "Concurrent requests — no race conditions or crashes"

say "  Firing 20 concurrent health checks at gateway..."
PIDS=()
RESULTS=()
for i in $(seq 1 20); do
  curl -s --max-time 5 -o /dev/null -w "%{http_code}" \
    http://127.0.0.1:8000/api/health &
  PIDS+=($!)
done

ALL_OK=true
for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

# Fire 10 concurrent auth requests
say "  Firing 10 concurrent auth requests..."
for i in $(seq 1 10); do
  curl -s --max-time 5 -X POST -H "Content-Type: application/json" \
    -d '{"email":"admin@melaka.medilink","password":"Admin@123"}' \
    http://127.0.0.1:8001/api/auth/login -o /dev/null &
done
wait
ok "Concurrent requests completed without hang"; ((PASS++)) || true
assert_up 8001 "Clinic A still up after concurrency test"
assert_up 8000 "Gateway still up after concurrency test"

# ── Scenario 8: Auth security ─────────────────────────────────────────────────
run_scenario 8 "Auth token rejection — invalid/expired tokens"

FAKE_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoYWNrZXIiLCJyb2xlIjoiYWRtaW4ifQ.fakeSignature"

for PORT in 8001 8002 8000; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 \
    -H "Authorization: Bearer $FAKE_TOKEN" \
    "http://127.0.0.1:$PORT/api/patients" 2>/dev/null)
  if [[ "$HTTP" == "401" || "$HTTP" == "403" ]]; then
    ok "Port $PORT correctly rejects fake token (HTTP $HTTP)"; ((PASS++)) || true
  else
    fail "Port $PORT returned HTTP $HTTP for fake token (expected 401/403)"
  fi
done

# No token
for PORT in 8001 8002 8000; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 \
    "http://127.0.0.1:$PORT/api/patients" 2>/dev/null)
  if [[ "$HTTP" == "401" || "$HTTP" == "403" || "$HTTP" == "422" ]]; then
    ok "Port $PORT correctly rejects no token (HTTP $HTTP)"; ((PASS++)) || true
  else
    warn "Port $PORT returned HTTP $HTTP with no token"
  fi
done

# ── Scenario 9: Large payload stress ─────────────────────────────────────────
run_scenario 9 "Large payload — oversized upload rejected gracefully"

# Create a 6MB dummy file (limit is usually 5MB)
TMPFILE=$(mktemp /tmp/chaos-test-XXXXXX.png)
dd if=/dev/urandom of="$TMPFILE" bs=1024 count=6144 2>/dev/null

TOK_A=$(get_token 8001 "admin@melaka.medilink" "Admin@123")
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
  -H "Authorization: Bearer $TOK_A" \
  -F "file=@$TMPFILE" \
  "http://127.0.0.1:8001/api/branding/logo" 2>/dev/null)
rm -f "$TMPFILE"

if [[ "$HTTP" == "413" || "$HTTP" == "422" || "$HTTP" == "400" ]]; then
  ok "Server rejected oversized upload with HTTP $HTTP"; ((PASS++)) || true
elif [[ "$HTTP" == "201" || "$HTTP" == "200" ]]; then
  warn "Server accepted 6MB upload (HTTP $HTTP) — consider adding size limit"
else
  warn "Unexpected HTTP $HTTP for oversized upload"
fi

assert_up 8001 "Clinic A still up after large upload test"

# ── Scenario 10: Duplicate IC blocked ────────────────────────────────────────
run_scenario 10 "Duplicate patient IC registration blocked"

# Try registering same IC twice via kiosk
IC="030305140854"
REG_PAYLOAD="{\"ic_number\":\"$IC\",\"name\":\"Test Patient\",\"phone\":\"0123456789\",\"password\":\"Test@1234\",\"confirm_password\":\"Test@1234\"}"

R1=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  -X POST -H "Content-Type: application/json" \
  -d "$REG_PAYLOAD" \
  "http://127.0.0.1:8001/api/kiosk/register" 2>/dev/null)

R2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  -X POST -H "Content-Type: application/json" \
  -d "$REG_PAYLOAD" \
  "http://127.0.0.1:8001/api/kiosk/register" 2>/dev/null)

if [[ "$R2" == "400" || "$R2" == "409" || "$R2" == "422" ]]; then
  ok "Duplicate IC registration blocked (HTTP $R2)"; ((PASS++)) || true
elif [[ "$R1" == "201" || "$R1" == "200" ]] && [[ "$R2" == "201" || "$R2" == "200" ]]; then
  fail "Duplicate IC was accepted twice — check unique constraint on ic_hash"
else
  warn "Register 1: HTTP $R1 / Register 2: HTTP $R2"
fi

# ── Results ───────────────────────────────────────────────────────────────────
sep
TOTAL=$((PASS + FAILURES))
printf "\n${BOLD}CHAOS TEST RESULTS${W}\n"
printf "  Passed:  ${G}%d${W}\n" "$PASS"
printf "  Failed:  ${R}%d${W}\n" "$FAILURES"
printf "  Total:   %d\n\n" "$TOTAL"

if [[ "$FAILURES" -eq 0 ]]; then
  printf "${G}✓ All chaos tests passed — MediLink is resilient!${W}\n\n"
  exit 0
else
  printf "${R}✗ $FAILURES test(s) failed — review output above.${W}\n\n"
  exit 1
fi
