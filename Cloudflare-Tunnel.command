#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Pulih — Public Tunnel (tries multiple services, uses first that works)
#  Exposes patient gateway port 8000 to the internet.
#  Run-Demo.command must already be running.
# ═══════════════════════════════════════════════════════════════════════════
set +e

B="\033[1;36m"; G="\033[0;32m"; Y="\033[0;33m"; R="\033[0;31m"; X="\033[0m"
ok(){  printf "  ${G}OK${X}   %s\n" "$*"; }
warn(){ printf "  ${Y}!${X}    %s\n" "$*"; }
bad(){ printf "  ${R}FAIL${X} %s\n" "$*"; }

# ── check gateway ────────────────────────────────────────────────────────────
if ! curl -fsS "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
  bad "Patient gateway (port 8000) not running — start Run-Demo.command first."
  read -r -p "Press Return to close…" _; exit 1
fi
ok "Patient gateway on port 8000 is up"

show_url(){
  local URL="$1"
  printf "\n"
  printf "${G}  ╔══════════════════════════════════════════════════════════╗${X}\n"
  printf "${G}  ║  Patient Portal LIVE                                     ║${X}\n"
  printf "${G}  ╚══════════════════════════════════════════════════════════╝${X}\n\n"
  printf "  ${B}Portal:${X}   ${G}%s${X}\n"          "$URL"
  printf "  ${B}Activate:${X} ${G}%s/activate${X}\n" "$URL"
  printf "  ${B}Login:${X}    ${G}%s/login${X}\n\n"  "$URL"
  printf "  Klinik Melaka kiosk: http://127.0.0.1:8001/kiosk\n"
  printf "  Klinik Jasin kiosk:  http://127.0.0.1:8002/kiosk\n\n"
  printf "  ${Y}URL copied to clipboard. Press Ctrl+C to stop.${X}\n\n"
  printf "%s" "$URL" | pbcopy 2>/dev/null
  open "$URL" 2>/dev/null || true
}

cleanup(){ kill "$PID_T" 2>/dev/null; wait "$PID_T" 2>/dev/null; printf "\nTunnel closed.\n"; }
trap cleanup EXIT INT TERM

LOGFILE="/tmp/medilink-tunnel.log"

# ── Option 1: Cloudflare quick tunnel ────────────────────────────────────────
CLOUDFLARED=""
for p in /opt/homebrew/bin/cloudflared /usr/local/bin/cloudflared \
          "$HOME/.local/bin/cloudflared" "$HOME/bin/cloudflared"; do
  [ -x "$p" ] && { CLOUDFLARED="$p"; break; }
done

if [ -n "$CLOUDFLARED" ]; then
  warn "Trying Cloudflare tunnel..."
  > "$LOGFILE"
  "$CLOUDFLARED" tunnel --config /dev/null --url http://127.0.0.1:8000 \
    > "$LOGFILE" 2>&1 &
  PID_T=$!
  for i in $(seq 1 20); do
    sleep 1
    URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGFILE" | head -1)
    [ -n "$URL" ] && break
  done
  if [ -n "$URL" ]; then
    # Verify it actually resolves
    if curl -fsS --max-time 5 "$URL/api/health" >/dev/null 2>&1; then
      show_url "$URL"
      wait "$PID_T"
      exit 0
    fi
  fi
  warn "Cloudflare tunnel not reachable, trying next..."
  kill "$PID_T" 2>/dev/null; wait "$PID_T" 2>/dev/null
fi

# ── Option 2: localhost.run (SSH-based, no install needed) ───────────────────
warn "Trying localhost.run (SSH)..."
> "$LOGFILE"
ssh -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 \
    -R 80:127.0.0.1:8000 \
    nokey@localhost.run \
    > "$LOGFILE" 2>&1 &
PID_T=$!
for i in $(seq 1 20); do
  sleep 1
  URL=$(grep -oE 'https://[a-z0-9-]+\.lhr\.life' "$LOGFILE" | head -1)
  [ -n "$URL" ] && break
done
if [ -n "$URL" ]; then
  show_url "$URL"
  wait "$PID_T"
  exit 0
fi
warn "localhost.run failed, trying next..."
kill "$PID_T" 2>/dev/null; wait "$PID_T" 2>/dev/null

# ── Option 3: serveo.net (SSH-based, no install needed) ─────────────────────
warn "Trying serveo.net (SSH)..."
> "$LOGFILE"
ssh -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 \
    -R 80:127.0.0.1:8000 \
    serveo.net \
    > "$LOGFILE" 2>&1 &
PID_T=$!
for i in $(seq 1 20); do
  sleep 1
  URL=$(grep -oE 'https://[a-z0-9]+\.serveo\.net' "$LOGFILE" | head -1)
  [ -n "$URL" ] && break
done
if [ -n "$URL" ]; then
  show_url "$URL"
  wait "$PID_T"
  exit 0
fi
kill "$PID_T" 2>/dev/null

# ── All failed ───────────────────────────────────────────────────────────────
bad "All tunnel services failed."
printf "\n  Manual option — run this in a new Terminal:\n"
printf "  ${B}ssh -R 80:localhost:8000 nokey@localhost.run${X}\n\n"
printf "  Or install ngrok: brew install ngrok && ngrok http 8000\n\n"
read -r -p "Press Return to close…" _
