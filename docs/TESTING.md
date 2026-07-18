# MediLink — Test Evidence

## Method

End-to-end API tests are run against a real server instance (uvicorn + SQLite
test database, seeded) exercising the same code paths as production. UI flows
are verified in-browser on LAN and through the public tunnel.

## Verified flows (automated, repeatable)

| # | Flow | Result |
|---|---|---|
| 1 | Kiosk check-in by IC → queue number issued, doctor auto-assigned | ✅ |
| 2 | Kiosk endpoints without device token | ✅ 401 |
| 3 | Symptom capture → AI triage → zone on ticket & queue order | ✅ (fail-safe Green verified with AI disabled) |
| 4 | Doctor writes record + prescription | ✅ 201 |
| 5 | DuitNow QR generation at kiosk and in patient app | ✅ |
| 6 | Payment confirm without token / double confirm | ✅ 401 / idempotent `already_confirmed` |
| 7 | Paid patient appears in pharmacy queue with medicine chit | ✅ |
| 8 | Login brute force (6th attempt) | ✅ 429 |
| 9 | Patient bills list → pay → receipt history | ✅ |
| 10 | Doctor file upload → attached to record → patient sees & downloads it | ✅ 201/200, access audited |
| 11 | Pharmacy expiry-alerts endpoint | ✅ |
| 12 | Staff login from public internet | ✅ 403 + audit entry |
| 13 | Kiosk route on public internet | ✅ redirect, APIs 403 |
| 14 | Admin account seeded from environment, dual-role (admin + kiosk patient via IC) | ✅ |

## Manual/UI verification

- iPad kiosk in landscape & portrait (responsive fit, camera permission over HTTPS)
- PWA install on iPhone (Add to Home Screen), tunnel access on mobile data
- Live queue updates over WebSocket across two screens
- Cloud mirror provisioning on fresh Supabase project + sync catch-up after
  simulated offline period
