#!/usr/bin/env bash
# Print every way to reach MediLink right now. Run anytime the network changes.
NAME=$(scutil --get LocalHostName 2>/dev/null || hostname -s)
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "no-wifi")
echo ""
echo "── MediLink access ──────────────────────────────────────────"
echo ""
echo "ON THIS MAC (always works, even with WiFi off):"
echo "   Kiosk:   https://localhost:3000/kiosk"
echo "   Staff:   https://localhost:3000/login"
echo ""
echo "OTHER DEVICES on the same WiFi — use the NAME, not the IP."
echo "The name never changes even when the WiFi/IP changes:"
echo "   Kiosk:   https://${NAME}.local:3000/kiosk"
echo "   Patient: https://${NAME}.local:3000"
echo "   (current IP fallback: https://${IP}:3000 )"
echo ""
echo "ANYWHERE via internet (patients on 4G, needs Mac online):"
echo "   https://medilink.harnova.my"
echo ""
echo "─────────────────────────────────────────────────────────────"
